import { useQuery } from '@tanstack/react-query'
import type { Analysis } from '@/lib/analysis'

export interface AgentDecision {
  t: number
  kind: 'publish' | 'analysis' | 'open' | 'close' | 'trigger' | 'skip' | 'error'
  text: string
  tx?: `0x${string}`
  user?: `0x${string}`
}

export interface AgentStatus {
  running: boolean
  agent: `0x${string}`
  cycleMs: number
  nextCycleAt: number
  startedAt: number
  lastCycleAt: number
  cycles: number
  spot: number
  analysis: Analysis | null
  feed: { price: number; updatedAt: number }
  gasUsdc: string
  usersWatched: number
  lastError: string
  decisions: AgentDecision[]
}

async function fetchStatus(signal: AbortSignal): Promise<AgentStatus | null> {
  try {
    const res = await fetch('/api/status', { signal })
    if (!res.ok) return null
    return (await res.json()) as AgentStatus
  } catch {
    return null
  }
}

/** Live status of the off-chain trading agent. `null` data means the agent process is offline. */
export function useAgent() {
  return useQuery({
    queryKey: ['agent-status'],
    queryFn: ({ signal }) => fetchStatus(signal),
    refetchInterval: 4_000,
    retry: false,
  })
}
