import { useState } from 'react'
import clsx from 'clsx'
import { Bot, Loader2, ShieldCheck } from 'lucide-react'
import type { VaultState } from '@/hooks/useVault'
import type { useVaultActions } from '@/hooks/useVaultActions'
import { fmtUsdc, tryParseUsdc } from '@/lib/contracts'
import { formatUsdc, parseUsdc } from '@/onchain-money'

type Actions = ReturnType<typeof useVaultActions>

interface Draft {
  enabled?: boolean
  leverage?: number
  margin?: string
}

export function AgentSettings({ vault, actions }: { vault: VaultState; actions: Actions }) {
  const s = vault.settings
  const [draft, setDraft] = useState<Draft>({})

  const onchainEnabled = s?.agentEnabled ?? false
  const onchainLeverage = s?.maxLeverage ? Number(s.maxLeverage) : 0
  const onchainMargin = s?.maxMarginPerTrade ?? 0n

  const enabled = draft.enabled ?? onchainEnabled
  const leverage = draft.leverage ?? (onchainLeverage || 2)
  const maxMargin = draft.margin ?? (onchainMargin > 0n ? formatUsdc(onchainMargin) : '50')

  const marginRaw = tryParseUsdc(maxMargin, parseUsdc)
  const dirty = enabled !== onchainEnabled || leverage !== onchainLeverage || marginRaw !== onchainMargin
  const busy = actions.pending !== null

  const save = () => {
    if (marginRaw === null) return
    void actions.saveSettings(enabled, leverage, maxMargin).then(() => setDraft({}))
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="label">Giới hạn cho agent</p>
        <ShieldCheck size={18} className="text-up" aria-hidden />
      </div>

      <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl bg-surface-muted p-4">
        <div className="flex items-center gap-3">
          <span className={clsx('flex size-10 items-center justify-center rounded-xl', enabled ? 'bg-accent text-canvas' : 'bg-surface-strong text-subtle')}>
            <Bot size={20} aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Cho phép agent tự giao dịch</p>
            <p className="text-xs text-subtle">{enabled ? 'Agent được phép mở và đóng lệnh' : 'Agent chỉ phân tích, không giao dịch'}</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Bật tự giao dịch"
          disabled={!vault.isConnected}
          onClick={() => setDraft((d) => ({ ...d, enabled: !enabled }))}
          className={clsx('relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40', enabled ? 'bg-accent' : 'bg-surface-strong')}
        >
          <span className={clsx('absolute top-1 size-5 rounded-full bg-canvas transition-transform', enabled ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>

      <div className="mt-4">
        <p className="text-sm font-medium text-ink-2">Đòn bẩy tối đa</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((l) => (
            <button
              key={l}
              type="button"
              disabled={!vault.isConnected}
              onClick={() => setDraft((d) => ({ ...d, leverage: l }))}
              aria-pressed={leverage === l}
              className={clsx(
                'num h-11 rounded-xl border text-sm font-semibold transition disabled:opacity-40',
                leverage === l ? 'border-accent bg-accent text-canvas' : 'border-line text-muted hover:bg-surface-strong',
              )}
            >
              {l}x
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="max-margin" className="text-sm font-medium text-ink-2">
          Ký quỹ tối đa mỗi lệnh (USDC)
        </label>
        <input
          id="max-margin"
          inputMode="decimal"
          value={maxMargin}
          disabled={!vault.isConnected}
          onChange={(e) => setDraft((d) => ({ ...d, margin: e.target.value.replace(',', '.') }))}
          className="num mt-2 h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base font-semibold text-ink outline-none focus:border-accent disabled:opacity-40"
        />
        {onchainMargin > 0n && <p className="mt-1 text-xs text-subtle">Đang lưu onchain: {fmtUsdc(onchainMargin)} USDC</p>}
      </div>

      <button
        type="button"
        onClick={save}
        disabled={!vault.isConnected || !dirty || marginRaw === null || busy}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-line text-sm font-semibold text-ink transition hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-40"
      >
        {actions.pending === 'Lưu cài đặt agent' ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden /> Đang lưu
          </>
        ) : (
          'Lưu giới hạn onchain'
        )}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        Agent không bao giờ rút được tiền của bạn. Nó chỉ mở và đóng vị thế trong giới hạn này, mỗi lệnh có cắt lỗ và chốt lời bắt buộc. Bạn có thể đóng lệnh hoặc rút tiền bất cứ lúc nào.
      </p>
    </section>
  )
}
