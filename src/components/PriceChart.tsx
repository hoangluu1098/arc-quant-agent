import { useMemo } from 'react'
import { ema, type Candle } from '@/lib/analysis'
import { usd } from '@/lib/contracts'

export interface Level {
  label: string
  price: number
  tone: 'accent' | 'up' | 'down'
}

const W = 860
const H = 340
const PAD = { top: 14, right: 74, bottom: 26, left: 8 }
const VISIBLE = 90

const toneColor = { accent: 'var(--accent)', up: 'var(--success)', down: 'var(--danger)' } as const

export function PriceChart({ candles, levels = [] }: { candles: Candle[]; levels?: Level[] }) {
  const view = useMemo(() => {
    const all = candles
    const e20 = ema(all.map((c) => c.close), 20)
    const e50 = ema(all.map((c) => c.close), 50)
    const start = Math.max(0, all.length - VISIBLE)
    const slice = all.slice(start)
    const prices = [...slice.flatMap((c) => [c.high, c.low]), ...levels.map((l) => l.price)]
    const lo = Math.min(...prices)
    const hi = Math.max(...prices)
    const pad = (hi - lo) * 0.06 || 1
    return { slice, e20: e20.slice(start), e50: e50.slice(start), lo: lo - pad, hi: hi + pad }
  }, [candles, levels])

  const { slice, lo, hi } = view
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const step = plotW / slice.length
  const x = (i: number) => PAD.left + step * i + step / 2
  const y = (p: number) => PAD.top + ((hi - p) / (hi - lo)) * plotH

  const line = (series: number[]) =>
    series
      .map((v, i) => (Number.isNaN(v) ? null : `${i === 0 || Number.isNaN(series[i - 1]) ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(' ')

  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
  const lastClose = slice[slice.length - 1].close

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Biểu đồ nến BTC/USD">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" />
          <text x={W - PAD.right + 8} y={y(t) + 4} fontSize="11" fill="var(--subtle)" className="num">
            {usd(t)}
          </text>
        </g>
      ))}

      {slice.map((c, i) => {
        const up = c.close >= c.open
        const color = up ? 'var(--success)' : 'var(--danger)'
        const bodyTop = y(Math.max(c.open, c.close))
        const bodyH = Math.max(1.5, Math.abs(y(c.open) - y(c.close)))
        return (
          <g key={c.time}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} stroke={color} strokeWidth="1" />
            <rect x={x(i) - step * 0.34} y={bodyTop} width={step * 0.68} height={bodyH} fill={color} rx="1" />
          </g>
        )
      })}

      <path d={line(view.e20)} fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      <path d={line(view.e50)} fill="none" stroke="var(--warn)" strokeWidth="1.6" strokeDasharray="5 4" />

      {levels.map((l) => (
        <g key={l.label}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(l.price)} y2={y(l.price)} stroke={toneColor[l.tone]} strokeDasharray="6 4" />
          <rect x={W - PAD.right} y={y(l.price) - 9} width={PAD.right - 4} height={18} rx="4" fill={toneColor[l.tone]} />
          <text x={W - PAD.right + 6} y={y(l.price) + 4} fontSize="10.5" fontWeight="700" fill="#0d1b2f">
            {l.label}
          </text>
        </g>
      ))}

      <g>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(lastClose)} y2={y(lastClose)} stroke="var(--ink)" strokeOpacity="0.35" />
        <rect x={W - PAD.right} y={y(lastClose) - 10} width={PAD.right - 4} height={20} rx="4" fill="var(--ink)" />
        <text x={W - PAD.right + 6} y={y(lastClose) + 4} fontSize="11" fontWeight="700" fill="#0d1b2f" className="num">
          {usd(lastClose)}
        </text>
      </g>

      <g fontSize="11" fill="var(--muted)">
        <line x1={PAD.left} x2={PAD.left + 18} y1={H - 8} y2={H - 8} stroke="var(--accent)" strokeWidth="2" />
        <text x={PAD.left + 24} y={H - 4}>EMA 20</text>
        <line x1={PAD.left + 84} x2={PAD.left + 102} y1={H - 8} y2={H - 8} stroke="var(--warn)" strokeWidth="2" strokeDasharray="5 4" />
        <text x={PAD.left + 108} y={H - 4}>EMA 50</text>
      </g>
    </svg>
  )
}
