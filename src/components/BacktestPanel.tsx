import clsx from 'clsx'
import type { BacktestResult } from '@/lib/analysis'

export function BacktestPanel({ result, candleCount }: { result: BacktestResult | null; candleCount: number }) {
  if (!result) return null
  const stats = [
    { k: 'Số lệnh', v: String(result.trades.length), tone: '' },
    { k: 'Tỷ lệ thắng', v: result.trades.length ? `${(result.winRate * 100).toFixed(0)}%` : '-', tone: '' },
    { k: 'Tổng kết quả', v: `${result.totalR >= 0 ? '+' : ''}${result.totalR.toFixed(1)}R`, tone: result.totalR >= 0 ? 'text-up' : 'text-down' },
    { k: 'Sụt giảm tối đa', v: `-${result.maxDrawdownR.toFixed(1)}R`, tone: 'text-muted' },
  ]
  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="label">Kiểm thử lại trên dữ liệu gần nhất</p>
        <span className="num text-xs text-subtle">{candleCount} nến</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.k} className="rounded-2xl bg-surface-muted p-3">
            <dt className="label">{s.k}</dt>
            <dd className={clsx('display num mt-1 text-xl font-semibold', s.tone)}>{s.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        1R là mức rủi ro của một lệnh (khoảng cách tới cắt lỗ). Kết quả mô phỏng với cùng quy tắc mà agent dùng, chưa tính phí, và không đảm bảo kết quả tương lai.
      </p>
    </section>
  )
}
