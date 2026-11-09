import { analyze, MIN_CANDLES, type Analysis, type Candle, type Signal } from './analysis'

export const HORIZONS = [
  { label: '1 giờ', seconds: 3600 },
  { label: '3 giờ', seconds: 3 * 3600 },
  { label: '6 giờ', seconds: 6 * 3600 },
] as const

export interface HistoryStats {
  samples: number
  /** Share of past cases where price moved in the direction the signal pointed (up for HOLD). */
  hitRate: number
  meanPct: number
  medianPct: number
}

export interface Forecast {
  horizonCandles: number
  sigmaPct: number
  range68: [number, number]
  range95: [number, number]
  history: HistoryStats | null
}

const stdev = (xs: number[]) => {
  const mean = xs.reduce((s, v) => s + v, 0) / xs.length
  return Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length)
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Scenario forecast, not a point prediction. The price band comes from recent volatility
 * (a symmetric lognormal range around the current price); the history block counts how the
 * price actually moved after the same signal appeared earlier in the loaded candles.
 */
export function forecast(candles: Candle[], current: Analysis, horizonSeconds: number, granularity: number): Forecast | null {
  const n = candles.length
  if (n < MIN_CANDLES + 2) return null
  const h = Math.max(1, Math.round(horizonSeconds / granularity))

  const closes = candles.map((c) => c.close)
  const window = closes.slice(-101)
  const returns = window.slice(1).map((c, i) => Math.log(c / window[i]))
  const sigmaPct = stdev(returns) * Math.sqrt(h)
  const price = current.price
  const band = (k: number): [number, number] => [price * Math.exp(-k * sigmaPct), price * Math.exp(k * sigmaPct)]

  const forward: number[] = []
  for (let i = MIN_CANDLES; i + h < n; i++) {
    const a = analyze(candles.slice(0, i + 1))
    if (a?.signal !== current.signal) continue
    forward.push(closes[i + h] / closes[i] - 1)
  }

  let history: HistoryStats | null = null
  if (forward.length > 0) {
    const dir = directionOf(current.signal)
    history = {
      samples: forward.length,
      hitRate: forward.filter((f) => f * dir > 0).length / forward.length,
      meanPct: (forward.reduce((s, f) => s + f, 0) / forward.length) * 100,
      medianPct: median(forward) * 100,
    }
  }

  return { horizonCandles: h, sigmaPct, range68: band(1), range95: band(2), history }
}

const directionOf = (s: Signal) => (s === 'SHORT' ? -1 : 1)

// ---------------------------------------------------------------------------------------
// Multi-timeframe consensus
// ---------------------------------------------------------------------------------------

export const TREND_FRAMES = [
  { label: '5 phút', seconds: 300, weight: 0.15 },
  { label: '15 phút', seconds: 900, weight: 0.25 },
  { label: '1 giờ', seconds: 3600, weight: 0.3 },
  { label: '1 ngày', seconds: 86400, weight: 0.3 },
] as const

export interface FrameResult {
  label: string
  weight: number
  analysis: Analysis | null
}

export interface Consensus {
  score: number
  signal: Signal
  agreement: 'aligned' | 'mixed' | 'conflict'
  text: string
}

export function consensus(frames: FrameResult[]): Consensus | null {
  const ready = frames.filter((f): f is FrameResult & { analysis: Analysis } => f.analysis !== null)
  if (ready.length < 2) return null
  const totalWeight = ready.reduce((s, f) => s + f.weight, 0)
  const score = ready.reduce((s, f) => s + f.analysis.score * f.weight, 0) / totalWeight
  const signal: Signal = score >= 0.2 ? 'LONG' : score <= -0.2 ? 'SHORT' : 'HOLD'

  const directional = ready.filter((f) => f.analysis.signal !== 'HOLD')
  const longs = directional.filter((f) => f.analysis.signal === 'LONG').length
  const shorts = directional.length - longs
  const agreement: Consensus['agreement'] =
    directional.length > 0 && (longs === 0 || shorts === 0) && directional.length >= Math.ceil(ready.length / 2)
      ? 'aligned'
      : longs > 0 && shorts > 0
        ? 'conflict'
        : 'mixed'

  const text =
    agreement === 'aligned'
      ? `Các khung thời gian đồng thuận ${longs > 0 ? 'tăng' : 'giảm'}, tín hiệu đáng tin hơn một khung đơn lẻ.`
      : agreement === 'conflict'
        ? 'Các khung thời gian đang mâu thuẫn (có khung tăng, có khung giảm). Nên thận trọng, nhất là khi ngược xu hướng khung lớn.'
        : 'Phần lớn các khung chưa có hướng rõ ràng.'

  return { score, signal, agreement, text }
}
