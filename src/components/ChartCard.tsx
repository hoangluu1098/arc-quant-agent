import clsx from 'clsx'
import { PriceChart, type Level } from '@/components/PriceChart'
import { TIMEFRAMES } from '@/lib/market'
import type { Candle } from '@/lib/analysis'
import { usd } from '@/lib/contracts'

interface Props {
  candles: Candle[] | undefined
  loading: boolean
  error: string | null
  granularity: number
  onGranularity: (s: number) => void
  levels: Level[]
}

export function ChartCard({ candles, loading, error, granularity, onGranularity, levels }: Props) {
  const last = candles?.[candles.length - 1]
  const first = candles && candles.length > 90 ? candles[candles.length - 90] : candles?.[0]
  const change = last && first ? ((last.close - first.open) / first.open) * 100 : 0

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">BTC / USD</p>
          <p className="display num mt-1 text-4xl font-semibold text-ink sm:text-5xl">{last ? usd(last.close, 2) : '...'}</p>
          {last && (
            <p className={clsx('num mt-1 text-sm font-semibold', change >= 0 ? 'text-up' : 'text-down')}>
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}% <span className="font-normal text-subtle">trong khung đang xem</span>
            </p>
          )}
        </div>
        <div className="flex gap-1 rounded-2xl bg-surface-muted p-1" role="tablist" aria-label="Khung thời gian">
          {TIMEFRAMES.map((t) => (
            <button
              key={t.seconds}
              role="tab"
              aria-selected={granularity === t.seconds}
              type="button"
              onClick={() => onGranularity(t.seconds)}
              className={clsx(
                'h-9 rounded-xl px-3 text-sm font-semibold transition',
                granularity === t.seconds ? 'bg-surface-strong text-ink' : 'text-subtle hover:text-ink-2',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {loading && <div className="aspect-[860/340] animate-pulse rounded-2xl bg-surface-muted" />}
        {error && !candles && <p className="py-16 text-center text-sm text-down">{error}</p>}
        {candles && candles.length > 0 && <PriceChart candles={candles} levels={levels} />}
      </div>
      <p className="mt-2 text-xs text-subtle">Nguồn dữ liệu nến: Coinbase Exchange, cập nhật mỗi 15 giây.</p>
    </section>
  )
}
