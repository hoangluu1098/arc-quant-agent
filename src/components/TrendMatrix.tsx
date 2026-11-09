import clsx from 'clsx'
import { useTrendFrames } from '@/hooks/useTrendFrames'
import type { Signal } from '@/lib/analysis'

const tone: Record<Signal, string> = { LONG: 'text-up', SHORT: 'text-down', HOLD: 'text-warn' }
const name: Record<Signal, string> = { LONG: 'Tăng', SHORT: 'Giảm', HOLD: 'Chưa rõ' }
const agreementBadge = {
  aligned: { label: 'Đồng thuận', cls: 'bg-up/15 text-up' },
  mixed: { label: 'Chưa rõ', cls: 'bg-warn/15 text-warn' },
  conflict: { label: 'Mâu thuẫn', cls: 'bg-down/15 text-down' },
} as const

export function TrendMatrix() {
  const { frames, consensus, loading } = useTrendFrames()

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="label">Xu hướng nhiều khung thời gian</p>
        {consensus && (
          <span className={clsx('rounded-full px-3 py-1 text-xs font-bold', agreementBadge[consensus.agreement].cls)}>
            {agreementBadge[consensus.agreement].label}
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {frames.map((f) => {
          const a = f.analysis
          const pct = a ? Math.abs(a.score) * 50 : 0
          const up = (a?.score ?? 0) >= 0
          return (
            <div key={f.label} className="rounded-2xl bg-surface-muted p-3">
              <p className="label">{f.label}</p>
              {a ? (
                <>
                  <p className={clsx('display mt-1 text-lg font-semibold', tone[a.signal])}>{name[a.signal]}</p>
                  <div className="relative mt-2 h-1.5 rounded-full bg-surface-strong" aria-hidden>
                    <div className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-line" />
                    <div
                      className={clsx('absolute top-0 h-full rounded-full', up ? 'bg-up' : 'bg-down')}
                      style={{ left: up ? '50%' : `${50 - pct}%`, width: `${pct}%` }}
                    />
                  </div>
                  <p className="num mt-1.5 text-xs text-subtle">
                    Điểm {a.score >= 0 ? '+' : ''}
                    {a.score.toFixed(2)} · RSI {a.indicators.rsi.toFixed(0)}
                  </p>
                </>
              ) : (
                <div className={clsx('mt-2 h-12 rounded-xl bg-surface-strong', loading && 'animate-pulse')} />
              )}
            </div>
          )
        })}
      </div>

      {consensus && (
        <p className="mt-4 text-pretty text-sm leading-relaxed text-ink-2">
          Điểm tổng hợp{' '}
          <span className={clsx('num font-semibold', tone[consensus.signal])}>
            {consensus.score >= 0 ? '+' : ''}
            {consensus.score.toFixed(2)} ({name[consensus.signal]})
          </span>
          . {consensus.text}
        </p>
      )}
      <p className="mt-2 text-xs text-subtle">Trọng số: 5 phút 15%, 15 phút 25%, 1 giờ 30%, 1 ngày 30%.</p>
    </section>
  )
}
