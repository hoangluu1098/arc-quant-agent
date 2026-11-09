import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { analyze, backtest } from '@/lib/analysis'
import { fetchCandles } from '@/lib/market'

export function useMarket(granularity: number) {
  const query = useQuery({
    queryKey: ['candles', granularity],
    queryFn: ({ signal }) => fetchCandles(granularity, signal),
    refetchInterval: 15_000,
    staleTime: 10_000,
  })

  const candles = query.data
  const analysis = useMemo(() => (candles ? analyze(candles) : null), [candles])
  const bt = useMemo(() => (candles ? backtest(candles) : null), [candles])

  return {
    candles,
    analysis,
    backtest: bt,
    isLoading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    updatedAt: query.dataUpdatedAt,
  }
}
