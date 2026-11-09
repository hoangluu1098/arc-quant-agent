import { useState } from 'react'
import clsx from 'clsx'
import { ConnectKitButton } from 'connectkit'
import { Loader2, Wallet } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import type { VaultState } from '@/hooks/useVault'
import type { useVaultActions } from '@/hooks/useVaultActions'
import { fmtUsdc, tryParseUsdc } from '@/lib/contracts'
import { formatUsdc, parseUsdc } from '@/onchain-money'

type Actions = ReturnType<typeof useVaultActions>

export function FundsCard({ vault, actions }: { vault: VaultState; actions: Actions }) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit')
  const [amount, setAmount] = useState('')

  const raw = tryParseUsdc(amount, parseUsdc)
  const max = mode === 'deposit' ? vault.walletUsdc : vault.free
  const insufficient = raw !== null && raw > max
  const busy = actions.pending !== null
  const hasPosition = vault.position?.open === true

  const submit = async () => {
    if (raw === null || insufficient) return
    if (mode === 'deposit') await actions.deposit(amount, vault.allowance)
    else await actions.withdraw(amount)
    setAmount('')
  }

  return (
    <section className="glass rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="label">Ví giao dịch của bạn</p>
        <TokenUSDC variant="branded" size={20} />
      </div>

      <p className="display num mt-2 text-4xl font-semibold text-ink">
        {vault.isConnected ? fmtUsdc(vault.free) : '0.00'}
        <span className="ml-2 text-base font-medium text-subtle">USDC</span>
      </p>
      <p className="mt-1 text-sm text-muted">
        {vault.isConnected
          ? `Có thể giao dịch. Ví của bạn đang có ${fmtUsdc(vault.walletUsdc)} USDC${hasPosition ? `, ${fmtUsdc(vault.position?.margin ?? 0n)} USDC đang ký quỹ` : ''}.`
          : 'Kết nối ví để nạp USDC và bật agent giao dịch.'}
      </p>

      {!vault.isConnected ? (
        <ConnectKitButton.Custom>
          {({ show }) => (
            <button
              type="button"
              onClick={show}
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-canvas transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
            >
              <Wallet size={18} aria-hidden /> Kết nối ví
            </button>
          )}
        </ConnectKitButton.Custom>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl bg-surface-muted p-1" role="tablist">
            {(['deposit', 'withdraw'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                type="button"
                onClick={() => {
                  setMode(m)
                  setAmount('')
                }}
                className={clsx(
                  'h-10 rounded-xl text-sm font-semibold transition',
                  mode === m ? 'bg-surface-strong text-ink' : 'text-subtle hover:text-ink-2',
                )}
              >
                {m === 'deposit' ? 'Nạp tiền' : 'Rút tiền'}
              </button>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 focus-within:border-accent">
            <input
              inputMode="decimal"
              placeholder="0.00"
              aria-label="Số USDC"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
              className="num display h-14 min-w-0 flex-1 bg-transparent text-2xl font-semibold text-ink outline-none placeholder:text-subtle"
            />
            <button
              type="button"
              onClick={() => setAmount(formatUsdc(max))}
              className="h-8 rounded-full border border-line px-3 text-xs font-semibold text-accent transition hover:bg-surface-strong"
            >
              Tối đa
            </button>
          </div>
          <p className={clsx('mt-2 text-xs', insufficient ? 'text-down' : 'text-subtle')}>
            {insufficient
              ? 'Số tiền vượt quá số dư khả dụng.'
              : `Khả dụng: ${fmtUsdc(max)} USDC${mode === 'deposit' ? ' trong ví' : ' trong vault'}`}
          </p>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={raw === null || insufficient || busy}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-canvas transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy && (actions.pending === 'Nạp USDC' || actions.pending === 'Rút USDC') ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden /> Đang xử lý
              </>
            ) : mode === 'deposit' ? (
              'Nạp vào vault'
            ) : (
              'Rút về ví'
            )}
          </button>
          {mode === 'withdraw' && hasPosition && (
            <p className="mt-2 text-xs text-subtle">Tiền đang ký quỹ trong vị thế mở sẽ được trả lại sau khi đóng lệnh.</p>
          )}
        </>
      )}
    </section>
  )
}
