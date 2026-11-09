import { useQuery } from '@tanstack/react-query'
import { getAbiItem, type Address, type Hex } from 'viem'
import { usePublicClient } from 'wagmi'
import { vaultAbi } from '@/lib/abis'
import { CHAIN_ID, DEPLOY_BLOCK, VAULT_ADDRESS } from '@/lib/contracts'

const opened = getAbiItem({ abi: vaultAbi, name: 'PositionOpened' })
const closed = getAbiItem({ abi: vaultAbi, name: 'PositionClosed' })

const LOOKBACK_BLOCKS = 20_000n

export interface ActivityItem {
  id: string
  type: 'open' | 'close'
  user: Address
  tx: Hex
  block: bigint
  time: number
  byAgent: boolean
  isLong?: boolean
  margin?: bigint
  leverage?: number
  entryPrice?: bigint
  exitPrice?: bigint
  pnl?: bigint
  reason?: number
  rationale: string
}

/** Onchain trade history, including the rationale string the agent wrote with each decision. */
export function useActivity() {
  const client = usePublicClient({ chainId: CHAIN_ID })

  return useQuery({
    queryKey: ['activity'],
    enabled: !!client,
    refetchInterval: 10_000,
    queryFn: async (): Promise<ActivityItem[]> => {
      if (!client) return []
      const head = await client.getBlockNumber()
      const from = head > LOOKBACK_BLOCKS + DEPLOY_BLOCK ? head - LOOKBACK_BLOCKS : DEPLOY_BLOCK
      const [openLogs, closeLogs] = await Promise.all([
        client.getLogs({ address: VAULT_ADDRESS, event: opened, fromBlock: from, toBlock: head }),
        client.getLogs({ address: VAULT_ADDRESS, event: closed, fromBlock: from, toBlock: head }),
      ])

      const items: ActivityItem[] = []
      for (const l of openLogs) {
        items.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          type: 'open',
          user: l.args.user as Address,
          tx: l.transactionHash,
          block: l.blockNumber,
          time: 0,
          byAgent: !!l.args.byAgent,
          isLong: l.args.isLong,
          margin: l.args.margin,
          leverage: l.args.leverage,
          entryPrice: l.args.entryPrice,
          rationale: l.args.rationale ?? '',
        })
      }
      for (const l of closeLogs) {
        items.push({
          id: `${l.transactionHash}-${l.logIndex}`,
          type: 'close',
          user: l.args.user as Address,
          tx: l.transactionHash,
          block: l.blockNumber,
          time: 0,
          byAgent: false,
          exitPrice: l.args.exitPrice,
          pnl: l.args.pnl,
          reason: l.args.reason,
          rationale: l.args.rationale ?? '',
        })
      }
      items.sort((a, b) => (a.block === b.block ? 0 : a.block < b.block ? 1 : -1))
      const recent = items.slice(0, 30)

      const blocks = [...new Set(recent.map((i) => i.block))]
      const stamps = new Map<bigint, number>()
      await Promise.all(
        blocks.map(async (b) => {
          const blk = await client.getBlock({ blockNumber: b })
          stamps.set(b, Number(blk.timestamp))
        }),
      )
      return recent.map((i) => ({ ...i, time: stamps.get(i.block) ?? 0 }))
    },
  })
}
