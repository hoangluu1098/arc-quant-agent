import { useCallback, useState } from 'react'
import { erc20Abi, type Hex } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { vaultAbi } from '@/lib/abis'
import { CHAIN_ID, PRICE_SCALE, USDC_ADDRESS, VAULT_ADDRESS } from '@/lib/contracts'
import { parseUsdc } from '@/onchain-money'

export function parseOnchainError(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : String(error)
  const msg = raw.toLowerCase()
  if (msg.includes('user rejected') || msg.includes('user denied')) return null
  if (msg.includes('insufficient funds')) return 'Không đủ USDC trả phí gas. Hãy nhận USDC test từ nút "Get test USDC".'
  if (msg.includes('insufficientbalance') || msg.includes('exceeds balance')) return 'Số dư không đủ.'
  if (msg.includes('stalepriceoracle') || msg.includes('stale')) return 'Giá oracle đã cũ. Hãy chờ agent đăng giá mới rồi thử lại.'
  if (msg.includes('insufficientpoolliquidity') || msg.includes('pool')) return 'Quỹ đối ứng không đủ thanh khoản cho lệnh này.'
  if (msg.includes('positionalreadyopen')) return 'Bạn đang có một vị thế mở.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Lỗi mạng. Hãy kiểm tra kết nối và thử lại.'
  const short = raw.split('\n')[0]
  return short.length > 140 ? `${short.slice(0, 140)}...` : short
}

export function useVaultActions() {
  const { chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: CHAIN_ID })
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<string | null>(null)

  const confirm = useCallback(
    async (hash: Hex) => {
      const receipt = await publicClient?.waitForTransactionReceipt({ hash })
      if (receipt && receipt.status !== 'success') throw new Error('Giao dịch bị revert')
      return hash
    },
    [publicClient],
  )

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setPending(label)
      try {
        if (chainId !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        await fn()
        toast.success(`${label} thành công`)
        await queryClient.invalidateQueries()
      } catch (e) {
        const message = parseOnchainError(e)
        if (message) toast.error(`${label} thất bại`, { description: message })
      } finally {
        setPending(null)
      }
    },
    [chainId, queryClient, switchChainAsync],
  )

  const approveIfNeeded = useCallback(
    async (amount: bigint, allowance: bigint) => {
      if (allowance >= amount) return
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [VAULT_ADDRESS, amount],
        chainId: CHAIN_ID,
      })
      await confirm(hash)
    },
    [confirm, writeContractAsync],
  )

  const deposit = (amount: string, allowance: bigint) =>
    run('Nạp USDC', async () => {
      const raw = parseUsdc(amount)
      await approveIfNeeded(raw, allowance)
      await confirm(
        await writeContractAsync({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'deposit', args: [raw], chainId: CHAIN_ID }),
      )
    })

  const withdraw = (amount: string) =>
    run('Rút USDC', async () => {
      await confirm(
        await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: 'withdraw',
          args: [parseUsdc(amount)],
          chainId: CHAIN_ID,
        }),
      )
    })

  const saveSettings = (enabled: boolean, maxLeverage: number, maxMargin: string) =>
    run('Lưu cài đặt agent', async () => {
      await confirm(
        await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: 'setSettings',
          args: [enabled, maxLeverage, parseUsdc(maxMargin)],
          chainId: CHAIN_ID,
        }),
      )
    })

  const openManual = (args: {
    isLong: boolean
    margin: string
    leverage: number
    stopLoss: number
    takeProfit: number
  }) =>
    run(`Mở ${args.isLong ? 'LONG' : 'SHORT'}`, async () => {
      await confirm(
        await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: 'openPosition',
          args: [
            args.isLong,
            parseUsdc(args.margin),
            args.leverage,
            BigInt(Math.round(args.stopLoss * PRICE_SCALE)),
            BigInt(Math.round(args.takeProfit * PRICE_SCALE)),
            'Manual trade',
          ],
          chainId: CHAIN_ID,
        }),
      )
    })

  const closePosition = (user: `0x${string}`) =>
    run('Đóng vị thế', async () => {
      await confirm(
        await writeContractAsync({
          address: VAULT_ADDRESS,
          abi: vaultAbi,
          functionName: 'closePosition',
          args: [user, 'Manual close'],
          chainId: CHAIN_ID,
        }),
      )
    })

  const fundPool = (amount: string, allowance: bigint) =>
    run('Nạp quỹ đối ứng', async () => {
      const raw = parseUsdc(amount)
      await approveIfNeeded(raw, allowance)
      await confirm(
        await writeContractAsync({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'fundPool', args: [raw], chainId: CHAIN_ID }),
      )
    })

  return { pending, deposit, withdraw, saveSettings, openManual, closePosition, fundPool }
}
