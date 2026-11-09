import { erc20Abi } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { vaultAbi, feedAbi } from '@/lib/abis'
import { CHAIN_ID, FEED_ADDRESS, PRICE_SCALE, USDC_ADDRESS, VAULT_ADDRESS } from '@/lib/contracts'

const vault = { address: VAULT_ADDRESS, abi: vaultAbi, chainId: CHAIN_ID } as const

export function useVault() {
  const { address, chainId, isConnected } = useAccount()
  const user = address ?? '0x0000000000000000000000000000000000000000'

  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { ...vault, functionName: 'accountOf', args: [user] },
      { address: USDC_ADDRESS, abi: erc20Abi, chainId: CHAIN_ID, functionName: 'balanceOf', args: [user] },
      { address: USDC_ADDRESS, abi: erc20Abi, chainId: CHAIN_ID, functionName: 'allowance', args: [user, VAULT_ADDRESS] },
      { ...vault, functionName: 'unrealizedPnl', args: [user] },
      { address: FEED_ADDRESS, abi: feedAbi, chainId: CHAIN_ID, functionName: 'getPrice' },
      { ...vault, functionName: 'poolLiquidity' },
      { ...vault, functionName: 'poolReserved' },
      { ...vault, functionName: 'tradeFeeBps' },
      { ...vault, functionName: 'maxStaleness' },
    ],
    query: { refetchInterval: 5_000 },
  })

  const [account, wallet, allowance, pnl, feed, liquidity, reserved, feeBps, staleness] = q.data ?? []

  const accountData = account?.status === 'success' ? account.result : undefined
  const pnlData = pnl?.status === 'success' ? pnl.result : undefined
  const feedData = feed?.status === 'success' ? feed.result : undefined

  return {
    address,
    isConnected,
    wrongChain: isConnected && chainId !== CHAIN_ID,
    loading: q.isLoading,
    refetch: q.refetch,
    walletUsdc: wallet?.status === 'success' ? wallet.result : 0n,
    allowance: allowance?.status === 'success' ? allowance.result : 0n,
    free: accountData?.[0] ?? 0n,
    settings: accountData?.[1],
    position: accountData?.[2],
    pnl: pnlData ? { value: pnlData[0], price: Number(pnlData[1]) / PRICE_SCALE, fresh: pnlData[2] } : undefined,
    feed: feedData ? { price: Number(feedData[0]) / PRICE_SCALE, updatedAt: Number(feedData[1]) } : undefined,
    pool: {
      liquidity: liquidity?.status === 'success' ? liquidity.result : 0n,
      reserved: reserved?.status === 'success' ? reserved.result : 0n,
    },
    feeBps: feeBps?.status === 'success' ? Number(feeBps.result) : 10,
    maxStaleness: staleness?.status === 'success' ? Number(staleness.result) : 60,
  }
}

export type VaultState = ReturnType<typeof useVault>
