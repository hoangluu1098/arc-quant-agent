import clsx from 'clsx'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { Analysis, Component, Signal } from '@/lib/analysis'

const signalStyle: Record<Signal, { label: string; tone: string; Icon: typeof Minus }> = {
  LONG: { label: 'MUA (LONG)', tone: 'text-up', Icon: ArrowUpRight },
  SHORT: { label: 'BÁN (SHORT)', tone: 'text-down', Icon: ArrowDownRight },
  HOLD: { label: 'ĐỨNG NGOÀI', tone: 'text-warn', Icon: Minus },
}

function ScoreBar({ c }: { c: Component }) {
  const pct = Math.abs(c.score) * 50
  const up = c.score >= 0
  return (
    <li className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink-2">{c.label}</span>
        <span className="num mono text-xs text-muted">{c.value}</span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-surface-strong" aria-hidden>
        <div className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-line" />
        <div
          className={clsx('absolute top-0 h-full rounded-full', up ? 'bg-up' : 'bg-down')}
          style={{ left: up ? '50%' : `${50 - pct}%`, width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-subtle">{c.note}</p>
    </li>
  )
}

export function SignalPanel({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) {
    return (
      <section className="glass rounded-3xl p-5">
        <p className="label">Phân tích AI</p>
        <div className="mt-4 h-24 animate-pulse rounded-2xl bg-surface-strong" />
      </section>
    )
  }
  const s = signalStyle[analysis.signal]
  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="label">Phân tích AI</p>
        <span className="num text-xs text-subtle">Điểm {analysis.score >= 0 ? '+' : ''}{analysis.score.toFixed(2)}</span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-4">
        <div className={clsx('display flex items-center gap-2 text-3xl font-semibold', s.tone)}>
          <s.Icon size={30} strokeWidth={2.2} aria-hidden />
          {s.label}
        </div>
        <div className="text-right">
          <p className="display num text-3xl font-semibold text-ink">{analysis.confidence}%</p>
          <p className="label">Độ tin cậy</p>
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-strong" role="progressbar" aria-valuenow={analysis.confidence} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${analysis.confidence}%` }} />
      </div>

      <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-2">{analysis.summary}</p>

      <ul className="mt-3 divide-y divide-line">
        {analysis.components.map((c) => (
          <ScoreBar key={c.key} c={c} />
        ))}
      </ul>
    </section>
  )
}
