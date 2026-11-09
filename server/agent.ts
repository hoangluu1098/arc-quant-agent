/**
 * Autonomous trading agent. Start with `bun run agent`.
 *
 * Every cycle it:
 *   1. pulls live BTC/USD candles and the spot price,
 *   2. publishes the spot price to the onchain price feed,
 *   3. runs the analysis engine,
 *   4. for every depositor: triggers stops/targets, closes reversed trades, or opens a new
 *      position that fits the limits the depositor set onchain.
 * Its status is served at GET /status (proxied by Vite as /api/status).
 */
import { createServer } from 'node:http'
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { vaultAbi, feedAbi } from '../src/lib/abis'
import { analyze, planTrade, type Analysis } from '../src/lib/analysis'
import { fetchCandles, fetchSpot } from '../src/lib/market'
import { getChain } from '../src/onchain-facts'
import { Amount, formatUsdc, gasTokenToUsdc, parseUsdc } from '../src/onchain-money'

const CYCLE_MS = 20_000
const ENTRY_CONFIDENCE = 55
const REVERSAL_CONFIDENCE = 55
const COOLDOWN_MS = 5 * 60_000
const MAX_HOLD_SECONDS = 6 * 3600
const PORT = 3001
const PRICE_DECIMALS = 1e8

const need = (name: string): string => {
  const v = process.env[name]
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`)
  return v
}

const VAULT = need('VITE_VAULT_ADDRESS') as Address
const FEED = need('VITE_FEED_ADDRESS') as Address
const account = privateKeyToAccount(need('AGENT_PRIVATE_KEY') as Hex)

// RPC: sandbox proxy first, public endpoint from the chain registry as the fallback.
const proxyChains = (process.env.RPC_PROXY_CHAINS || '').split(',')
const rpcUrl =
  process.env.RPC_URL_Arc_Testnet ||
  (process.env.RPC_PROXY_BASE_URL && proxyChains.includes('Arc_Testnet')
    ? `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`
    : getChain(arcTestnet.id)?.rpcUrls[0])

const pub = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) })
// The sandbox RPC proxy is read-only (it refuses eth_sendRawTransaction), so broadcasts go to the public endpoint.
const wallet = createWalletClient({ account, chain: arcTestnet, transport: http(getChain(arcTestnet.id)?.rpcUrls[0]) })

interface Decision {
  t: number
  kind: 'publish' | 'analysis' | 'open' | 'close' | 'trigger' | 'skip' | 'error'
  text: string
  tx?: Hex
  user?: Address
}

const state = {
  startedAt: Date.now(),
  lastCycleAt: 0,
  cycles: 0,
  spot: 0,
  analysis: null as Analysis | null,
  feed: { price: 0, updatedAt: 0 },
  gasUsdc: '0',
  usersWatched: 0,
  lastError: '',
  decisions: [] as Decision[],
}
const lastAction = new Map<Address, number>()

function log(kind: Decision['kind'], text: string, extra: Partial<Decision> = {}) {
  state.decisions.unshift({ t: Date.now(), kind, text, ...extra })
  state.decisions.length = Math.min(state.decisions.length, 80)
  console.log(`[${kind}] ${text}`)
}

const errMsg = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e)
  return m.split('\n')[0].slice(0, 200)
}

const to1e8 = (v: number) => BigInt(Math.round(v * PRICE_DECIMALS))
const clip = (s: string) => s.slice(0, 260)

async function publishPrice(spot: number): Promise<boolean> {
  const [, updatedAt] = await pub.readContract({ address: FEED, abi: feedAbi, functionName: 'getPrice' })
  const age = Math.floor(Date.now() / 1000) - Number(updatedAt)
  if (age < 12) return true
  try {
    const { request } = await pub.simulateContract({
      account,
      address: FEED,
      abi: feedAbi,
      functionName: 'publish',
      args: [to1e8(spot)],
    })
    const hash = await wallet.writeContract(request)
    await pub.waitForTransactionReceipt({ hash })
    return true
  } catch (e) {
    log('error', `Không đăng được giá lên oracle: ${errMsg(e)}`)
    return false
  }
}

async function sendVault(functionName: 'trigger' | 'closePosition' | 'agentOpenPosition', args: readonly unknown[]) {
  const { request } = await pub.simulateContract({
    account,
    address: VAULT,
    abi: vaultAbi,
    functionName,
    args,
  } as never)
  const hash = await wallet.writeContract(request as never)
  const receipt = await pub.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error('Giao dịch bị revert')
  return hash
}

async function listUsers(): Promise<Address[]> {
  const total = Number(await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: 'usersLength' }))
  const out: Address[] = []
  for (let offset = 0; offset < total; offset += 50) {
    const page = await pub.readContract({
      address: VAULT,
      abi: vaultAbi,
      functionName: 'usersSlice',
      args: [BigInt(offset), 50n],
    })
    out.push(...page)
  }
  return out
}

async function handleUser(user: Address, a: Analysis, spot: number) {
  const [balance, settings, pos] = await pub.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: 'accountOf',
    args: [user],
  })
  const short = `${user.slice(0, 6)}...${user.slice(-4)}`

  if (pos.open) {
    // 1. Stops, targets and liquidations are enforced first.
    try {
      await pub.simulateContract({ account, address: VAULT, abi: vaultAbi, functionName: 'trigger', args: [user] })
      const hash = await sendVault('trigger', [user])
      log('trigger', `Đã khớp lệnh cắt lỗ / chốt lời cho ${short}`, { tx: hash, user })
      lastAction.set(user, Date.now())
      return
    } catch {
      // Not triggerable yet, continue.
    }
    // 2. Close when the model reverses against the position, or the trade is stale.
    const side = pos.isLong ? 'LONG' : 'SHORT'
    const reversed = a.signal !== 'HOLD' && a.signal !== side && a.confidence >= REVERSAL_CONFIDENCE
    const aged = Math.floor(Date.now() / 1000) - Number(pos.openedAt) > MAX_HOLD_SECONDS
    if (reversed || aged) {
      const why = reversed ? `Signal flipped to ${a.signal}. ${a.rationale}` : 'Max holding time reached'
      const hash = await sendVault('closePosition', [user, clip(why)])
      log('close', reversed ? `Đóng ${side} cho ${short}: tín hiệu đảo chiều sang ${a.signal}` : `Đóng ${side} cho ${short}: quá thời gian nắm giữ`, {
        tx: hash,
        user,
      })
      lastAction.set(user, Date.now())
    }
    return
  }

  if (!settings.agentEnabled) return
  if (a.signal === 'HOLD' || a.confidence < ENTRY_CONFIDENCE) return
  if (Date.now() - (lastAction.get(user) ?? 0) < COOLDOWN_MS) return

  const equity = Number(formatUsdc(balance))
  const plan = planTrade({ ...a, price: spot }, {
    equityUsdc: equity,
    maxLeverage: settings.maxLeverage,
    maxMarginUsdc: Number(formatUsdc(settings.maxMarginPerTrade)),
  })
  if (!plan) {
    log('skip', `Bỏ qua ${short}: số dư hoặc hạn mức mỗi lệnh quá nhỏ`, { user })
    lastAction.set(user, Date.now() - COOLDOWN_MS + 60_000)
    return
  }
  const margin = parseUsdc(plan.margin.toFixed(2))
  const poolFree = await pub.readContract({ address: VAULT, abi: vaultAbi, functionName: 'poolFree' })
  if (poolFree < margin) {
    log('skip', 'Quỹ đối ứng không đủ thanh khoản để mở lệnh mới', { user })
    lastAction.set(user, Date.now() - COOLDOWN_MS + 60_000)
    return
  }
  const hash = await sendVault('agentOpenPosition', [
    user,
    plan.side === 'LONG',
    margin,
    plan.leverage,
    to1e8(plan.stopLoss),
    to1e8(plan.takeProfit),
    clip(a.rationale),
  ])
  log('open', `Mở ${plan.side} ${plan.leverage}x với ${plan.margin.toFixed(2)} USDC cho ${short} (độ tin cậy ${a.confidence}%)`, {
    tx: hash,
    user,
  })
  lastAction.set(user, Date.now())
}

async function cycle() {
  const [candles, spot] = await Promise.all([fetchCandles(900), fetchSpot()])
  state.spot = spot

  const gas = await pub.getBalance({ address: account.address })
  state.gasUsdc = gasTokenToUsdc(arcTestnet.id, Amount.fromRaw(gas, 18)).toFixed(4)

  const published = await publishPrice(spot)
  const [feedPrice, feedUpdated] = await pub.readContract({ address: FEED, abi: feedAbi, functionName: 'getPrice' })
  state.feed = { price: Number(feedPrice) / PRICE_DECIMALS, updatedAt: Number(feedUpdated) }

  const a = analyze(candles)
  if (!a) {
    log('error', 'Chưa đủ dữ liệu nến để phân tích')
    return
  }
  const prev = state.analysis
  state.analysis = a
  if (!prev || prev.signal !== a.signal) {
    log('analysis', `Tín hiệu ${a.signal} (độ tin cậy ${a.confidence}%): ${a.summary}`)
  }
  if (!published) return

  const users = await listUsers()
  state.usersWatched = users.length
  for (const user of users) {
    try {
      await handleUser(user, a, spot)
    } catch (e) {
      log('error', `Lỗi khi xử lý ${user.slice(0, 6)}...: ${errMsg(e)}`, { user })
    }
  }
}

async function loop() {
  for (;;) {
    try {
      await cycle()
      state.lastError = ''
    } catch (e) {
      state.lastError = errMsg(e)
      console.error('[cycle]', state.lastError)
    }
    state.cycles += 1
    state.lastCycleAt = Date.now()
    await new Promise((r) => setTimeout(r, CYCLE_MS))
  }
}

createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        running: true,
        agent: account.address,
        cycleMs: CYCLE_MS,
        nextCycleAt: state.lastCycleAt + CYCLE_MS,
        ...state,
      }),
    )
    return
  }
  res.writeHead(404)
  res.end('not found')
}).listen(PORT, '127.0.0.1')

console.log(`Agent ${account.address} đang chạy, trạng thái tại http://127.0.0.1:${PORT}/status`)
void loop()
