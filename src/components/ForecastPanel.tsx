import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { Analysis, Candle } from '@/lib/analysis'
import { usd } from '@/lib/contracts'
import { forecast, HORIZONS } from '@/lib/forecast'

interface Props {
  candles: Candle[] | undefined
  analysis: Analysis | null
  granularity: number
}

const directionText = { LONG: 'tăng', SHORT: 'giảm', HOLD: 'tăng' } as const

export function ForecastPanel({ candles, analysis, granularity }: Props) {
  const [horizon, setHorizon] = useState<number>(HORIZONS[1].seconds)

  const result = useMemo(
    () => (candles && analysis ? forecast(candles, analysis, horizon, granularity) : null),
    [candles, analysis, horizon, granularity],
  )

  const lo95 = result?.range95[0] ?? 0
  const hi95 = result?.range95[1] ?? 1
  const at = (p: number) => ((p - lo95) / (hi95 - lo95 || 1)) * 100
  const h = result?.history

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Dự báo kịch bản</p>
        <div className="flex gap-1 rounded-2xl bg-surface-muted p-1" role="tablist" aria-label="Khoảng thời gian dự báo">
          {HORIZONS.map((o) => (
            <button
              key={o.seconds}
              role="tab"
              type="button"
              aria-selected={horizon === o.seconds}
              onClick={() => setHorizon(o.seconds)}
              className={clsx(
                'h-9 rounded-xl px-3 text-sm font-semibold transition',
                horizon === o.seconds ? 'bg-surface-strong text-ink' : 'text-subtle hover:text-ink-2',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {!result || !analysis ? (
        <div className="mt-4 h-28 animate-pulse rounded-2xl bg-surface-muted" />
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            Vùng giá có thể xảy ra sau {HORIZONS.find((o) => o.seconds === horizon)?.label}, dựa trên biến động gần đây (biên độ ±{(result.sigmaPct * 100).toFixed(2)}%):
          </p>

          <div className="relative mt-5 h-10" aria-hidden>
            <div className="absolute top-3.5 h-3 w-full rounded-full bg-surface-strong" />
            <div
              className="absolute top-3.5 h-3 rounded-full bg-accent"
              style={{ left: `${at(result.range68[0])}%`, width: `${at(result.range68[1]) - at(result.range68[0])}%` }}
            />
            <div className="absolute top-1 h-8 w-0.5 rounded bg-ink" style={{ left: `${at(analysis.price)}%` }} />
          </div>
          <div className="num flex justify-between text-xs text-muted">
            <span>{usd(result.range95[0])}</span>
            <span className="font-semibold text-ink">Hiện tại {usd(analysis.price)}</span>
            <span>{usd(result.range95[1])}</span>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-muted p-3">
              <dt className="label">Khả năng ~68%</dt>
              <dd className="num mt-1 text-sm font-semibold text-ink">
                {usd(result.range68[0])} - {usd(result.range68[1])}
              </dd>
            </div>
            <div className="rounded-2xl bg-surface-muted p-3">
              <dt className="label">Khả năng ~95%</dt>
              <dd className="num mt-1 text-sm font-semibold text-ink">
                {usd(result.range95[0])} - {usd(result.range95[1])}
              </dd>
            </div>
          </dl>

          <div className="mt-4 rounded-2xl bg-surface-muted p-4">
            <p className="label">Lịch sử khi tín hiệu giống hiện tại ({analysis.signal === 'HOLD' ? 'đứng ngoài' : analysis.signal})</p>
            {h && h.samples >= 5 ? (
              <>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-2">
                  Trong {h.samples} lần trước trên dữ liệu đang tải, giá {directionText[analysis.signal]} sau khoảng thời gian này ở{' '}
                  <span className="num font-semibold text-ink">{(h.hitRate * 100).toFixed(0)}%</span> số lần. Thay đổi trung vị{' '}
                  <span className="num font-semibold text-ink">
                    {h.medianPct >= 0 ? '+' : ''}
                    {h.medianPct.toFixed(2)}%
                  </span>
                  , trung bình{' '}
                  <span className="num font-semibold text-ink">
                    {h.meanPct >= 0 ? '+' : ''}
                    {h.meanPct.toFixed(2)}%
                  </span>
                  .
                </p>
                {h.samples < 30 && <p className="mt-2 text-xs text-warn">Mẫu còn ít ({h.samples} lần), kết quả dễ sai lệch.</p>}
              </>
            ) : (
              <p className="mt-2 text-sm text-subtle">Chưa đủ số lần lặp lại trong dữ liệu để thống kê. Thử khung thời gian khác.</p>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-subtle">
            Đây là vùng giá theo thống kê biến động, không phải dự đoán chắc chắn. Giá có thể ra ngoài vùng, đặc biệt khi có tin tức bất ngờ.
          </p>
        </>
      )}
    </section>
  )
}
