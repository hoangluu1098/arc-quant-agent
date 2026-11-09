import type { Candle } from './analysis'

const BASE = 'https://api.exchange.coinbase.com'
const PRODUCT = 'BTC-USD'

export const TIMEFRAMES = [
  { label: '5 phút', seconds: 300 },
  { label: '15 phút', seconds: 900 },
  { label: '1 giờ', seconds: 3600 },
] as const

/** Latest candles for BTC/USD, oldest first. The public endpoint returns up to 300. */
export async function fetchCandles(granularity = 900, signal?: AbortSignal): Promise<Candle[]> {
  const res = await fetch(`${BASE}/products/${PRODUCT}/candles?granularity=${granularity}`, { signal })
  if (!res.ok) throw new Error(`Không tải được dữ liệu nến (${res.status})`)
  const rows = (await res.json()) as number[][]
  return rows
    .map(([time, low, high, open, close, volume]) => ({ time, low, high, open, close, volume }))
    .sort((a, b) => a.time - b.time)
}

/** Latest traded BTC/USD price. */
export async function fetchSpot(signal?: AbortSignal): Promise<number> {
  const res = await fetch(`${BASE}/products/${PRODUCT}/ticker`, { signal })
  if (!res.ok) throw new Error(`Không tải được giá (${res.status})`)
  const data = (await res.json()) as { price: string }
  const price = Number(data.price)
  if (!Number.isFinite(price) || price <= 0) throw new Error('Giá không hợp lệ')
  return price
}
