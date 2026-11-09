import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { analyze, type Candle } from '@/lib/analysis'
import { consensus, TREND_FRAMES, type FrameResult } from '@/lib/forecast'
import { fetchCandles } from '@/lib/market'

interface Combined {
  datas: (Candle[] | undefined)[]
  loading: boolean
}

/** Analyses BTC/USD on several timeframes and blends them into one consensus. */
export function useTrendFrames() {
  const { datas, loading } = useQueries({
    queries: TREND_FRAMES.map((f) => ({
      queryKey: ['candles', f.seconds],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchCandles(f.seconds, signal),
      refetchInterval: 60_000,
      staleTime: 30_000,
    })),
    combine: (results): Combined => ({ datas: results.map((r) => r.data), loading: results.some((r) => r.isLoading) }),
  })

  const frames = useMemo<FrameResult[]>(
    () => TREND_FRAMES.map((f, i) => ({ label: f.label, weight: f.weight, analysis: datas[i] ? analyze(datas[i]) : null })),
    [datas],
  )
  const result = useMemo(() => consensus(frames), [frames])

  return { frames, consensus: result, loading }
}
