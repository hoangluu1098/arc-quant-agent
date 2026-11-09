import { useState } from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'
import type { VaultState } from '@/hooks/useVault'
import type { useVaultActions } from '@/hooks/useVaultActions'
import { ago, useNow } from '@/hooks/useNow'
import { SL_ATR, TP_ATR } from '@/lib/analysis'
import { fmtUsdc, PRICE_SCALE, tryParseUsdc, usd } from '@/lib/contracts'
import { parseUsdc } from '@/onchain-money'

type Actions = ReturnType<typeof useVaultActions>

const px = (v: bigint) => usd(Number(v) / PRICE_SCALE, 2)

function OpenPosition({ vault, actions }: { vault: VaultState; actions: Actions }) {
  const now = useNow()
  const p = vault.position!
  const pnl = vault.pnl
  const long = p.isLong
  const pnlValue = pnl?.value ?? 0n
  const positive = pnlValue >= 0n
  const pct = p.margin > 0n ? (Number(pnlValue) / Number(p.margin)) * 100 : 0

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="label">Vị thế đang mở</p>
        <span className={clsx('rounded-full px-3 py-1 text-xs font-bold', long ? 'bg-up/15 text-up' : 'bg-down/15 text-down')}>
          {long ? 'LONG' : 'SHORT'} {p.leverage}x
        </span>
      </div>

      <p className={clsx('display num mt-3 text-4xl font-semibold', positive ? 'text-up' : 'text-down')}>
        {positive ? '+' : ''}
        {fmtUsdc(pnlValue)}
        <span className="ml-2 text-base font-medium text-subtle">USDC</span>
      </p>
      <p className="num mt-1 text-sm text-muted">
        {positive ? '+' : ''}
        {pct.toFixed(1)}% trên ký quỹ. Lãi lỗ chưa chốt, đã gồm phí giao dịch dự kiến.
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {[
          ['Giá vào', px(p.entryPrice)],
          ['Giá oracle', pnl ? usd(pnl.price, 2) : '-'],
          ['Cắt lỗ', px(p.stopLoss)],
          ['Chốt lời', px(p.takeProfit)],
          ['Ký quỹ', `${fmtUsdc(p.margin)} USDC`],
          ['Mở lúc', ago(now - Number(p.openedAt))],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="label">{k}</dt>
            <dd className="num mt-0.5 font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      <button
        type="button"
        disabled={actions.pending !== null || !vault.address}
        onClick={() => {
          if (vault.address) void actions.closePosition(vault.address)
        }}
        className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line font-semibold text-ink transition hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-40"
      >
        {actions.pending === 'Đóng vị thế' ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden /> Đang đóng
          </>
        ) : (
          'Đóng vị thế ngay'
        )}
      </button>
      <p className="mt-2 text-xs text-subtle">Cắt lỗ và chốt lời được thực thi bởi bất kỳ ai gọi lệnh kích hoạt, không phụ thuộc vào agent.</p>
    </section>
  )
}

function ManualTrade({ vault, actions, atr }: { vault: VaultState; actions: Actions; atr: number | null }) {
  const now = useNow()
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG')
  const [margin, setMargin] = useState('10')
  const [leverage, setLeverage] = useState(2)

  const price = vault.feed?.price ?? 0
  const age = vault.feed ? now - vault.feed.updatedAt : Infinity
  const stale = age > vault.maxStaleness - 5
  const marginRaw = tryParseUsdc(margin, parseUsdc)
  const tooMuch = marginRaw !== null && marginRaw > vault.free
  const long = side === 'LONG'
  const slDist = (atr ?? price * 0.004) * SL_ATR
  const tpDist = (atr ?? price * 0.004) * TP_ATR
  const sl = long ? price - slDist : price + slDist
  const tp = long ? price + tpDist : price - tpDist
  const notional = marginRaw ? Number(marginRaw) / 1e6 * leverage : 0
  const fee = notional * (vault.feeBps / 10_000)
  const canTrade = vault.isConnected && marginRaw !== null && !tooMuch && !stale && price > 0 && actions.pending === null

  return (
    <section className="glass rounded-3xl p-5">
      <p className="label">Giao dịch thủ công</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(['LONG', 'SHORT'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={clsx(
              'h-11 rounded-xl border text-sm font-bold transition',
              side === s
                ? s === 'LONG'
                  ? 'border-up bg-up/15 text-up'
                  : 'border-down bg-down/15 text-down'
                : 'border-line text-subtle hover:bg-surface-strong',
            )}
          >
            {s === 'LONG' ? 'Mua (LONG)' : 'Bán (SHORT)'}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
        <input
          inputMode="decimal"
          aria-label="Ký quỹ USDC"
          value={margin}
          onChange={(e) => setMargin(e.target.value.replace(',', '.'))}
          className="num h-12 rounded-2xl border border-line bg-surface px-4 font-semibold text-ink outline-none focus:border-accent"
        />
        <div className="flex gap-1">
          {[1, 2, 3, 5].map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={leverage === l}
              onClick={() => setLeverage(l)}
              className={clsx('num h-12 w-11 rounded-xl border text-sm font-semibold transition', leverage === l ? 'border-accent bg-accent text-canvas' : 'border-line text-muted hover:bg-surface-strong')}
            >
              {l}x
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        {[
          ['Giá vào (oracle)', price > 0 ? usd(price, 2) : '-'],
          ['Cắt lỗ', price > 0 ? usd(sl, 2) : '-'],
          ['Chốt lời', price > 0 ? usd(tp, 2) : '-'],
          ['Phí giao dịch', `${fee.toFixed(3)} USDC (${(vault.feeBps / 100).toFixed(2)}%)`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <dt className="text-subtle">{k}</dt>
            <dd className="num font-semibold text-ink">{v}</dd>
          </div>
        ))}
      </dl>

      {stale && vault.feed && (
        <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
          Giá oracle đã {ago(age)}. Cần agent đang chạy để đăng giá mới trước khi mở lệnh.
        </p>
      )}
      {tooMuch && <p className="mt-3 text-xs text-down">Ký quỹ vượt quá số dư trong vault.</p>}

      <button
        type="button"
        disabled={!canTrade}
        onClick={() => void actions.openManual({ isLong: long, margin, leverage, stopLoss: sl, takeProfit: tp })}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-canvas transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
      >
        {actions.pending?.startsWith('Mở') ? (
          <>
            <Loader2 size={18} className="animate-spin" aria-hidden /> Đang mở lệnh
          </>
        ) : (
          `Mở ${side}`
        )}
      </button>
    </section>
  )
}

export function PositionCard({ vault, actions, atr }: { vault: VaultState; actions: Actions; atr: number | null }) {
  if (!vault.isConnected) return null
  if (vault.position?.open) return <OpenPosition vault={vault} actions={actions} />
  return <ManualTrade vault={vault} actions={actions} atr={atr} />
}
