/**
 * Market analysis engine. Pure functions only, shared by the browser dashboard and the
 * server-side trading agent so both always reach the same conclusion from the same candles.
 *
 * The model is a weighted ensemble of classic technical indicators. Each indicator votes a
 * score in [-1, 1]; the weighted sum drives the signal, the confidence and the trade plan.
 */

export interface Candle {
  time: number // unix seconds, candle open
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type Signal = 'LONG' | 'SHORT' | 'HOLD'
export type Stance = 'bull' | 'bear' | 'neutral'

export interface Component {
  key: 'trend' | 'macd' | 'rsi' | 'bands' | 'momentum' | 'volume'
  label: string
  value: string
  score: number
  weight: number
  stance: Stance
  note: string
}

export interface Analysis {
  signal: Signal
  score: number
  confidence: number
  price: number
  time: number
  atr: number
  atrPct: number
  indicators: {
    ema20: number
    ema50: number
    rsi: number
    macdHist: number
    percentB: number
    roc: number
  }
  components: Component[]
  summary: string
  rationale: string
}

export const SIGNAL_THRESHOLD = 0.25
export const MIN_CANDLES = 60

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const stanceOf = (s: number): Stance => (s > 0.15 ? 'bull' : s < -0.15 ? 'bear' : 'neutral')
const last = <T>(a: T[]): T => a[a.length - 1]

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN)
  if (values.length < period) return out
  const k = 2 / (period + 1)
  let seed = 0
  for (let i = 0; i < period; i++) seed += values[i]
  out[period - 1] = seed / period
  for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k)
  return out
}

export function rsi(closes: number[], period = 14): number[] {
  const out = new Array<number>(closes.length).fill(NaN)
  if (closes.length <= period) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  gain /= period
  loss /= period
  const toRsi = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss))
  out[period] = toRsi()
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(d, 0)) / period
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = toRsi()
  }
  return out
}

export function macd(closes: number[]) {
  const fast = ema(closes, 12)
  const slow = ema(closes, 26)
  const line = closes.map((_, i) => fast[i] - slow[i])
  const start = line.findIndex((v) => !Number.isNaN(v))
  const hist = new Array<number>(closes.length).fill(NaN)
  if (start >= 0) {
    const sig = ema(line.slice(start), 9)
    for (let i = 0; i < sig.length; i++) hist[start + i] = line[start + i] - sig[i]
  }
  return { line, hist }
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid = sma(closes, period)
  return closes.map((_, i) => {
    if (Number.isNaN(mid[i])) return { mid: NaN, upper: NaN, lower: NaN }
    let variance = 0
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j] - mid[i]) ** 2
    const sd = Math.sqrt(variance / period)
    return { mid: mid[i], upper: mid[i] + mult * sd, lower: mid[i] - mult * sd }
  })
}

export function atr(candles: Candle[], period = 14): number[] {
  const out = new Array<number>(candles.length).fill(NaN)
  if (candles.length <= period) return out
  const tr = candles.map((c, i) =>
    i === 0
      ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)),
  )
  let acc = 0
  for (let i = 1; i <= period; i++) acc += tr[i]
  out[period] = acc / period
  for (let i = period + 1; i < candles.length; i++) out[i] = (out[i - 1] * (period - 1) + tr[i]) / period
  return out
}

const fmtUsd = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 0 })

export function analyze(candles: Candle[]): Analysis | null {
  if (candles.length < MIN_CANDLES) return null
  const closes = candles.map((c) => c.close)
  const n = closes.length
  const price = closes[n - 1]

  const e20 = last(ema(closes, 20))
  const e50 = last(ema(closes, 50))
  const rsiNow = last(rsi(closes, 14))
  const m = macd(closes)
  const hist = m.hist[n - 1]
  const histPrev = m.hist[n - 2]
  const bb = last(bollinger(closes))
  const atrNow = last(atr(candles, 14))
  if ([e20, e50, rsiNow, hist, histPrev, bb.upper, atrNow].some((v) => Number.isNaN(v)) || atrNow <= 0) return null

  const percentB = bb.upper === bb.lower ? 0.5 : (price - bb.lower) / (bb.upper - bb.lower)
  const roc = (price - closes[n - 11]) / closes[n - 11]
  const atrPct = atrNow / price

  // 1. Trend: fast EMA vs slow EMA, normalised by volatility.
  const trend = Math.tanh((e20 - e50) / atrNow) * 0.8 + (price > e20 ? 0.2 : -0.2)

  // 2. MACD histogram level and slope.
  const macdScore = Math.tanh(hist / (0.25 * atrNow)) * 0.8 + (hist > histPrev ? 0.2 : -0.2)

  // 3. RSI: contrarian at the extremes, mild momentum in the middle.
  const rsiScore =
    rsiNow > 70
      ? -Math.min(1, (rsiNow - 70) / 15)
      : rsiNow < 30
        ? Math.min(1, (30 - rsiNow) / 15)
        : clamp(((rsiNow - 50) / 20) * 0.6, -0.6, 0.6)

  // 4. Bollinger %B: fade moves that stretch past the bands.
  const bandScore = -Math.tanh((percentB - 0.5) * 3) * 0.6

  // 5. Rate of change over 10 candles, normalised by volatility.
  const momentum = Math.tanh(roc / (atrPct * 3))

  // 6. Volume confirmation of the last 3 candles.
  const avgVol = candles.slice(-23, -3).reduce((s, c) => s + c.volume, 0) / 20
  const recentVol = candles.slice(-3).reduce((s, c) => s + c.volume, 0) / 3
  const volRatio = avgVol > 0 ? recentVol / avgVol : 1
  const move3 = Math.sign(price - closes[n - 4])
  const volumeScore = volRatio > 1 ? move3 * Math.min(1, volRatio - 1) : 0

  const weights = { trend: 0.28, macd: 0.22, rsi: 0.18, bands: 0.1, momentum: 0.14, volume: 0.08 }

  const components: Component[] = [
    {
      key: 'trend',
      label: 'Xu hướng EMA 20/50',
      value: `${fmtUsd(e20)} / ${fmtUsd(e50)}`,
      score: trend,
      weight: weights.trend,
      stance: stanceOf(trend),
      note: e20 > e50 ? 'EMA20 nằm trên EMA50, xu hướng tăng' : 'EMA20 nằm dưới EMA50, xu hướng giảm',
    },
    {
      key: 'macd',
      label: 'MACD (12,26,9)',
      value: hist.toFixed(1),
      score: macdScore,
      weight: weights.macd,
      stance: stanceOf(macdScore),
      note: `Histogram ${hist >= 0 ? 'dương' : 'âm'} và đang ${hist > histPrev ? 'tăng' : 'giảm'}`,
    },
    {
      key: 'rsi',
      label: 'RSI (14)',
      value: rsiNow.toFixed(1),
      score: rsiScore,
      weight: weights.rsi,
      stance: stanceOf(rsiScore),
      note: rsiNow > 70 ? 'Quá mua, rủi ro đảo chiều giảm' : rsiNow < 30 ? 'Quá bán, khả năng hồi phục' : 'Vùng trung tính',
    },
    {
      key: 'bands',
      label: 'Bollinger %B (20,2)',
      value: percentB.toFixed(2),
      score: bandScore,
      weight: weights.bands,
      stance: stanceOf(bandScore),
      note: percentB > 1 ? 'Giá vượt dải trên' : percentB < 0 ? 'Giá thủng dải dưới' : 'Giá nằm trong dải',
    },
    {
      key: 'momentum',
      label: 'Động lượng 10 nến',
      value: `${(roc * 100).toFixed(2)}%`,
      score: momentum,
      weight: weights.momentum,
      stance: stanceOf(momentum),
      note: roc >= 0 ? 'Giá cao hơn so với 10 nến trước' : 'Giá thấp hơn so với 10 nến trước',
    },
    {
      key: 'volume',
      label: 'Khối lượng xác nhận',
      value: `${volRatio.toFixed(2)}x`,
      score: volumeScore,
      weight: weights.volume,
      stance: stanceOf(volumeScore),
      note: volRatio > 1 ? 'Khối lượng cao hơn trung bình, xác nhận chuyển động' : 'Khối lượng thấp, tín hiệu yếu',
    },
  ]

  const score = clamp(components.reduce((s, c) => s + c.score * c.weight, 0), -1, 1)
  const signal: Signal = score >= SIGNAL_THRESHOLD ? 'LONG' : score <= -SIGNAL_THRESHOLD ? 'SHORT' : 'HOLD'
  // High volatility lowers conviction.
  const volPenalty = atrPct > 0.015 ? 15 : 0
  const confidence = clamp(Math.round(Math.abs(score) * 160) - volPenalty, 0, 100)

  const bulls = components.filter((c) => c.stance === 'bull').length
  const bears = components.filter((c) => c.stance === 'bear').length
  const direction =
    signal === 'LONG' ? 'nghiêng về MUA (LONG)' : signal === 'SHORT' ? 'nghiêng về BÁN (SHORT)' : 'chưa rõ hướng, nên đứng ngoài'
  const summary = `${bulls} chỉ báo tăng, ${bears} chỉ báo giảm: thị trường ${direction}. ${
    e20 > e50 ? 'Xu hướng ngắn hạn tăng' : 'Xu hướng ngắn hạn giảm'
  }, RSI ${rsiNow.toFixed(0)}, biến động ATR ${(atrPct * 100).toFixed(2)}%.`

  const top = [...components]
    .sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight))
    .slice(0, 3)
    .map((c) => `${c.key}${c.score >= 0 ? '+' : '-'}`)
    .join(' ')
  const rationale = `${signal} score ${score.toFixed(2)} conf ${confidence}% rsi ${rsiNow.toFixed(0)} atr ${(atrPct * 100).toFixed(2)}% drivers ${top}`

  return {
    signal,
    score,
    confidence,
    price,
    time: candles[n - 1].time,
    atr: atrNow,
    atrPct,
    indicators: { ema20: e20, ema50: e50, rsi: rsiNow, macdHist: hist, percentB, roc },
    components,
    summary,
    rationale,
  }
}

// ---------------------------------------------------------------------------------------
// Trade planning
// ---------------------------------------------------------------------------------------

export interface TradePlan {
  side: 'LONG' | 'SHORT'
  entry: number
  stopLoss: number
  takeProfit: number
  leverage: number
  margin: number // USDC, human units
  riskUsdc: number
  rewardRisk: number
}

export interface PlanOptions {
  equityUsdc: number
  maxLeverage: number
  maxMarginUsdc: number
  riskPct?: number
}

export const SL_ATR = 1.5
export const TP_ATR = 2.5
export const MIN_MARGIN_USDC = 1

/** Sizes a position so a stop-out costs about `riskPct` of equity, with leverage capped by conviction. */
export function planTrade(a: Analysis, opts: PlanOptions): TradePlan | null {
  if (a.signal === 'HOLD') return null
  const riskPct = opts.riskPct ?? 0.02
  const slDist = a.atr * SL_ATR
  const tpDist = a.atr * TP_ATR
  const slPct = slDist / a.price
  const convictionCap = a.confidence >= 75 ? 4 : a.confidence >= 60 ? 3 : a.confidence >= 45 ? 2 : 1
  // Keep the stop well inside the liquidation distance (1 / leverage).
  const safeCap = Math.floor(0.5 / slPct)
  const leverage = Math.max(1, Math.min(opts.maxLeverage, convictionCap, safeCap, 5))
  const riskUsdc = opts.equityUsdc * riskPct
  let margin = riskUsdc / (slPct * leverage)
  margin = Math.min(margin, opts.maxMarginUsdc, opts.equityUsdc)
  margin = Math.floor(margin * 100) / 100
  if (!(margin >= MIN_MARGIN_USDC)) return null
  const long = a.signal === 'LONG'
  return {
    side: a.signal,
    entry: a.price,
    stopLoss: long ? a.price - slDist : a.price + slDist,
    takeProfit: long ? a.price + tpDist : a.price - tpDist,
    leverage,
    margin,
    riskUsdc: margin * leverage * slPct,
    rewardRisk: tpDist / slDist,
  }
}

// ---------------------------------------------------------------------------------------
// Walk-forward backtest of the same rules on the candles currently loaded
// ---------------------------------------------------------------------------------------

export interface BacktestTrade {
  side: 'LONG' | 'SHORT'
  entryTime: number
  exitTime: number
  entry: number
  exit: number
  r: number // result in multiples of the planned risk
  reason: 'stop' | 'target' | 'reversal' | 'timeout'
}

export interface BacktestResult {
  trades: BacktestTrade[]
  winRate: number
  totalR: number
  avgR: number
  maxDrawdownR: number
}

const MAX_HOLD = 48
const ENTRY_CONFIDENCE = 50

export function backtest(candles: Candle[]): BacktestResult {
  const trades: BacktestTrade[] = []
  interface OpenTrade {
    side: 'LONG' | 'SHORT'
    i: number
    entry: number
    sl: number
    tp: number
    risk: number
  }
  let open: OpenTrade | null = null

  for (let i = MIN_CANDLES; i < candles.length; i++) {
    const c = candles[i]
    const closeTrade = (exit: number, reason: BacktestTrade['reason']) => {
      if (!open) return
      const dir = open.side === 'LONG' ? 1 : -1
      trades.push({
        side: open.side,
        entryTime: candles[open.i].time,
        exitTime: c.time,
        entry: open.entry,
        exit,
        r: (dir * (exit - open.entry)) / open.risk,
        reason,
      })
      open = null
    }

    if (open) {
      const long: boolean = open.side === 'LONG'
      const hitSl = long ? c.low <= open.sl : c.high >= open.sl
      const hitTp = long ? c.high >= open.tp : c.low <= open.tp
      if (hitSl) closeTrade(open.sl, 'stop')
      else if (hitTp) closeTrade(open.tp, 'target')
      else if (i - open.i >= MAX_HOLD) closeTrade(c.close, 'timeout')
    }

    const a = analyze(candles.slice(0, i + 1))
    if (!a) continue
    if (open) {
      if (a.signal !== 'HOLD' && a.signal !== open.side && a.confidence >= ENTRY_CONFIDENCE) closeTrade(c.close, 'reversal')
    }
    if (!open && a.signal !== 'HOLD' && a.confidence >= ENTRY_CONFIDENCE && i < candles.length - 1) {
      const long: boolean = a.signal === 'LONG'
      open = {
        side: a.signal,
        i,
        entry: a.price,
        sl: long ? a.price - a.atr * SL_ATR : a.price + a.atr * SL_ATR,
        tp: long ? a.price + a.atr * TP_ATR : a.price - a.atr * TP_ATR,
        risk: a.atr * SL_ATR,
      }
    }
  }

  let equity = 0
  let peak = 0
  let maxDd = 0
  for (const t of trades) {
    equity += t.r
    peak = Math.max(peak, equity)
    maxDd = Math.max(maxDd, peak - equity)
  }
  const wins = trades.filter((t) => t.r > 0).length
  return {
    trades,
    winRate: trades.length ? wins / trades.length : 0,
    totalR: equity,
    avgR: trades.length ? equity / trades.length : 0,
    maxDrawdownR: maxDd,
  }
}
