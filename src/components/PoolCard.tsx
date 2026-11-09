import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { VaultState } from '@/hooks/useVault'
import type { useVaultActions } from '@/hooks/useVaultActions'
import { fmtUsdc, tryParseUsdc } from '@/lib/contracts'
import { formatUsdc, parseUsdc } from '@/onchain-money'

type Actions = ReturnType<typeof useVaultActions>

export function PoolCard({ vault, actions }: { vault: VaultState; actions: Actions }) {
  const [amount, setAmount] = useState('')
  const free = vault.pool.liquidity - vault.pool.reserved
  const raw = tryParseUsdc(amount, parseUsdc)
  const tooMuch = raw !== null && raw > vault.walletUsdc
  const lowLiquidity = free < 10_000_000n

  return (
    <section className="glass rounded-3xl p-5">
      <p className="label">Quỹ đối ứng</p>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        {[
          ['Tổng quỹ', vault.pool.liquidity],
          ['Đang giữ chỗ', vault.pool.reserved],
          ['Còn trống', free],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl bg-surface-muted p-3">
            <dt className="label">{k as string}</dt>
            <dd className="num display mt-1 text-lg font-semibold">{fmtUsdc(v as bigint)}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-subtle">
        Quỹ này trả lãi cho lệnh thắng và nhận lỗ của lệnh thua, nên cần có thanh khoản để agent mở lệnh. Lãi tối đa mỗi lệnh bằng 100% ký quỹ.
        Chỉ nạp USDC test: số tiền nạp vào quỹ do chủ sở hữu hợp đồng quản lý, bạn không rút lại được.
      </p>
      {lowLiquidity && (
        <p className="mt-2 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
          Quỹ còn ít thanh khoản nên agent có thể không mở được lệnh mới. Hãy nạp thêm.
        </p>
      )}

      {vault.isConnected && (
        <div className="mt-4 flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-line bg-surface px-3 focus-within:border-accent">
            <input
              inputMode="decimal"
              aria-label="USDC nạp vào quỹ đối ứng"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
              className="num h-11 min-w-0 flex-1 bg-transparent font-semibold text-ink outline-none placeholder:text-subtle"
            />
            <button type="button" onClick={() => setAmount(formatUsdc(vault.walletUsdc))} className="text-xs font-semibold text-accent">
              Tối đa
            </button>
          </div>
          <button
            type="button"
            disabled={raw === null || tooMuch || actions.pending !== null}
            onClick={() => {
              void actions.fundPool(amount, vault.allowance).then(() => setAmount(''))
            }}
            className="flex h-11 items-center gap-2 rounded-2xl border border-line px-4 text-sm font-semibold text-ink transition hover:bg-surface-strong disabled:cursor-not-allowed disabled:opacity-40"
          >
            {actions.pending === 'Nạp quỹ đối ứng' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            Nạp quỹ
          </button>
        </div>
      )}
      {tooMuch && <p className="mt-2 text-xs text-down">Số tiền vượt quá số dư trong ví.</p>}
    </section>
  )
}
