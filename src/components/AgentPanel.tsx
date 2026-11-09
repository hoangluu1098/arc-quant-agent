import clsx from 'clsx'
import { Activity, ExternalLink, Fuel, Radio, Users } from 'lucide-react'
import { ago, useNow } from '@/hooks/useNow'
import type { AgentStatus } from '@/hooks/useAgent'
import { shortAddr, AGENT_ADDRESS, CHAIN_ID } from '@/lib/contracts'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'

const kindStyle: Record<string, string> = {
  open: 'bg-up/15 text-up',
  close: 'bg-down/15 text-down',
  trigger: 'bg-warn/15 text-warn',
  analysis: 'bg-accent/15 text-accent',
  skip: 'bg-surface-strong text-subtle',
  error: 'bg-down/15 text-down',
  publish: 'bg-surface-strong text-subtle',
}
const kindLabel: Record<string, string> = {
  open: 'Mở lệnh',
  close: 'Đóng lệnh',
  trigger: 'Kích hoạt',
  analysis: 'Phân tích',
  skip: 'Bỏ qua',
  error: 'Lỗi',
  publish: 'Giá',
}

export function AgentPanel({ status, loading }: { status: AgentStatus | null | undefined; loading: boolean }) {
  const now = useNow()
  const online = !!status && now * 1000 - status.lastCycleAt < status.cycleMs * 3 + 10_000
  const feedAge = status ? now - status.feed.updatedAt : 0

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="label">Agent tự giao dịch</p>
        <span className={clsx('flex items-center gap-2 text-xs font-semibold', online ? 'text-up' : 'text-subtle')}>
          <span className={clsx('size-2 rounded-full', online ? 'animate-pulse bg-up' : 'bg-subtle')} />
          {loading ? 'Đang kiểm tra' : online ? 'Đang hoạt động' : 'Ngoại tuyến'}
        </span>
      </div>

      <a
        href={buildAddressExplorerUrl(CHAIN_ID, AGENT_ADDRESS)}
        target="_blank"
        rel="noopener noreferrer"
        className="mono mt-2 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
      >
        {shortAddr(AGENT_ADDRESS)} <ExternalLink size={12} aria-hidden />
      </a>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-surface-muted p-3">
          <dt className="label flex items-center gap-1"><Users size={12} aria-hidden /> Ví theo dõi</dt>
          <dd className="num display mt-1 text-xl font-semibold">{status?.usersWatched ?? '-'}</dd>
        </div>
        <div className="rounded-2xl bg-surface-muted p-3">
          <dt className="label flex items-center gap-1"><Fuel size={12} aria-hidden /> Gas (USDC)</dt>
          <dd className="num display mt-1 text-xl font-semibold">{status ? Number(status.gasUsdc).toFixed(2) : '-'}</dd>
        </div>
        <div className="rounded-2xl bg-surface-muted p-3">
          <dt className="label flex items-center gap-1"><Radio size={12} aria-hidden /> Giá oracle</dt>
          <dd className="num display mt-1 text-xl font-semibold">{status ? `${feedAge}s` : '-'}</dd>
        </div>
      </dl>

      {status && Number(status.gasUsdc) < 0.05 && (
        <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
          Ví agent sắp hết USDC trả gas. Hãy nạp thêm USDC test vào địa chỉ agent ở trên.
        </p>
      )}
      {!loading && !status && (
        <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-xs text-muted">
          Tiến trình agent chưa chạy. Khởi động bằng lệnh <span className="mono text-ink">bun run agent</span>.
        </p>
      )}
      {status?.lastError && <p className="mt-3 text-xs text-down">Lỗi chu kỳ gần nhất: {status.lastError}</p>}

      <div className="mt-4 flex items-center gap-2">
        <Activity size={14} className="text-subtle" aria-hidden />
        <p className="label">Nhật ký quyết định</p>
      </div>
      <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
        {(status?.decisions ?? []).length === 0 && <li className="py-6 text-center text-sm text-subtle">Chưa có quyết định nào.</li>}
        {(status?.decisions ?? []).map((d) => (
          <li key={`${d.t}-${d.text}`} className="rounded-2xl bg-surface-muted p-3">
            <div className="flex items-center justify-between gap-2">
              <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-bold', kindStyle[d.kind])}>{kindLabel[d.kind]}</span>
              <span className="text-[11px] text-subtle">{ago(now - Math.floor(d.t / 1000))}</span>
            </div>
            <p className="mt-1.5 text-pretty text-sm leading-snug text-ink-2">{d.text}</p>
            {d.tx && (
              <a
                href={buildTxExplorerUrl(CHAIN_ID, d.tx)}
                target="_blank"
                rel="noopener noreferrer"
                className="mono mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
              >
                {d.tx.slice(0, 10)}... <ExternalLink size={10} aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
