import clsx from 'clsx'
import { Bot, ExternalLink, User } from 'lucide-react'
import { useAccount } from 'wagmi'
import { useActivity, type ActivityItem } from '@/hooks/useActivity'
import { ago, useNow } from '@/hooks/useNow'
import { CHAIN_ID, CLOSE_REASONS, fmtUsdc, PRICE_SCALE, shortAddr, usd } from '@/lib/contracts'
import { buildTxExplorerUrl } from '@/onchain-facts'

const price = (v: bigint | undefined) => usd(Number(v ?? 0n) / PRICE_SCALE, 2)

function Row({ item, mine, now }: { item: ActivityItem; mine: boolean; now: number }) {
  const isOpen = item.type === 'open'
  const pnl = item.pnl ?? 0n
  const title = isOpen
    ? `${item.byAgent ? 'Agent' : 'Thủ công'} mở ${item.isLong ? 'LONG' : 'SHORT'} ${item.leverage}x`
    : `Đóng vị thế (${CLOSE_REASONS[item.reason ?? 0] ?? 'Khác'})`
  const Icon = isOpen && !item.byAgent ? User : Bot

  return (
    <li className="rounded-2xl bg-surface-muted p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-strong text-accent">
            <Icon size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {title}
              {mine && <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">CỦA BẠN</span>}
            </p>
            <p className="num mt-0.5 text-xs text-muted">
              {shortAddr(item.user)}
              {isOpen
                ? ` · ${fmtUsdc(item.margin ?? 0n)} USDC @ ${price(item.entryPrice)}`
                : ` · thoát @ ${price(item.exitPrice)}`}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          {!isOpen && (
            <p className={clsx('num text-sm font-bold', pnl >= 0n ? 'text-up' : 'text-down')}>
              {pnl >= 0n ? '+' : ''}
              {fmtUsdc(pnl)}
            </p>
          )}
          <a
            href={buildTxExplorerUrl(CHAIN_ID, item.tx)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-subtle hover:text-ink"
          >
            {item.time ? ago(now - item.time) : 'xem tx'} <ExternalLink size={10} aria-hidden />
          </a>
        </div>
      </div>
      {item.rationale && <p className="mono mt-2 break-words rounded-lg bg-canvas/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-subtle">{item.rationale}</p>}
    </li>
  )
}

export function ActivityFeed() {
  const { address } = useAccount()
  const { data, isLoading, error } = useActivity()
  const now = useNow(5000)

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="label">Lịch sử giao dịch onchain</p>
        <span className="text-xs text-subtle">Kèm lý do agent ghi lại</span>
      </div>
      <ul className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1">
        {isLoading && <li className="h-20 animate-pulse rounded-2xl bg-surface-muted" />}
        {error && <li className="py-6 text-center text-sm text-down">Không tải được lịch sử giao dịch.</li>}
        {data && data.length === 0 && (
          <li className="py-8 text-center text-sm text-subtle">Chưa có giao dịch nào. Bật agent và nạp USDC để bắt đầu.</li>
        )}
        {data?.map((item) => (
          <Row key={item.id} item={item} now={now} mine={!!address && item.user.toLowerCase() === address.toLowerCase()} />
        ))}
      </ul>
    </section>
  )
}
