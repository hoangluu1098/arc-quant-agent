import { useMemo, useState } from 'react'
import { ActivityFeed } from '@/components/ActivityFeed'
import { AgentPanel } from '@/components/AgentPanel'
import { AgentSettings } from '@/components/AgentSettings'
import { BacktestPanel } from '@/components/BacktestPanel'
import { ChartCard } from '@/components/ChartCard'
import { ForecastPanel } from '@/components/ForecastPanel'
import { FundsCard } from '@/components/FundsCard'
import { Header } from '@/components/Header'
import { PoolCard } from '@/components/PoolCard'
import { PositionCard } from '@/components/PositionCard'
import { SignalPanel } from '@/components/SignalPanel'
import { TrendMatrix } from '@/components/TrendMatrix'
import type { Level } from '@/components/PriceChart'
import { useAgent } from '@/hooks/useAgent'
import { useMarket } from '@/hooks/useMarket'
import { useVault } from '@/hooks/useVault'
import { useVaultActions } from '@/hooks/useVaultActions'
import { PRICE_SCALE } from '@/lib/contracts'

export default function App() {
  const [granularity, setGranularity] = useState(900)
  const market = useMarket(granularity)
  const agent = useAgent()
  const vault = useVault()
  const actions = useVaultActions()

  const levels = useMemo<Level[]>(() => {
    const p = vault.position
    if (!p?.open) return []
    const f = (v: bigint) => Number(v) / PRICE_SCALE
    return [
      { label: 'VÀO', price: f(p.entryPrice), tone: 'accent' },
      { label: 'SL', price: f(p.stopLoss), tone: 'down' },
      { label: 'TP', price: f(p.takeProfit), tone: 'up' },
    ]
  }, [vault.position])

  return (
    <div className="min-h-dvh pb-24">
      <Header />
      <main className="mx-auto grid max-w-7xl gap-5 px-4 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-5">
          <ChartCard
            candles={market.candles}
            loading={market.isLoading}
            error={market.error}
            granularity={granularity}
            onGranularity={setGranularity}
            levels={levels}
          />
          <SignalPanel analysis={market.analysis} />
          <TrendMatrix />
          <ForecastPanel candles={market.candles} analysis={market.analysis} granularity={granularity} />
          <BacktestPanel result={market.backtest} candleCount={market.candles?.length ?? 0} />
          <AgentPanel status={agent.data} loading={agent.isLoading} />
        </div>

        <aside className="space-y-5">
          <FundsCard vault={vault} actions={actions} />
          <PositionCard vault={vault} actions={actions} atr={market.analysis?.atr ?? null} />
          <AgentSettings vault={vault} actions={actions} />
          <PoolCard vault={vault} actions={actions} />
        </aside>

        <div className="lg:col-span-2">
          <ActivityFeed />
        </div>
      </main>
    </div>
  )
}
