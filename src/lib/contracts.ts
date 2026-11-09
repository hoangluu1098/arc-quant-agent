import type { Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, USDC_DECIMALS } from '@/onchain-facts'
import { Amount } from '@/onchain-money'

export const CHAIN_ID = arcTestnet.id

const vault = import.meta.env.VITE_VAULT_ADDRESS as string | undefined
const feed = import.meta.env.VITE_FEED_ADDRESS as string | undefined
const agent = import.meta.env.VITE_AGENT_ADDRESS as string | undefined
const deployBlock = import.meta.env.VITE_VAULT_DEPLOY_BLOCK as string | undefined

if (!vault || !feed || !agent) {
  throw new Error('Thiếu VITE_VAULT_ADDRESS, VITE_FEED_ADDRESS hoặc VITE_AGENT_ADDRESS trong .env')
}

export const VAULT_ADDRESS = vault as Address
export const FEED_ADDRESS = feed as Address
export const AGENT_ADDRESS = agent as Address
export const DEPLOY_BLOCK = deployBlock ? BigInt(deployBlock) : 0n

const usdc = getUsdc(CHAIN_ID)
if (!usdc) throw new Error('Không tìm thấy USDC cho Arc Testnet')
export const USDC_ADDRESS = usdc.address as Address

export const PRICE_SCALE = 1e8

export const CLOSE_REASONS = ['Thủ công', 'Agent', 'Cắt lỗ', 'Chốt lời', 'Thanh lý', 'Khẩn cấp'] as const

export const shortAddr = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

export const usd = (v: number, digits = 0) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })

/** Formats a raw 6-decimal USDC amount with a fixed number of fraction digits. */
export const fmtUsdc = (raw: bigint, digits = 2) => Amount.fromRaw(raw, USDC_DECIMALS).toFixed(digits)

/** Parses a user-typed USDC amount, or returns null when it is empty, zero or malformed. */
export const tryParseUsdc = (value: string, parse: (v: string) => bigint): bigint | null => {
  if (!/^\d*\.?\d{0,6}$/.test(value) || value === '' || value === '.') return null
  try {
    const raw = parse(value)
    return raw > 0n ? raw : null
  } catch {
    return null
  }
}
