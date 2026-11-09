import { ConnectKitButton } from 'connectkit'
import { NetworkArc } from '@web3icons/react'
import { LineChart } from 'lucide-react'

export function Header() {
  return (
    <header className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pb-2 pt-5 sm:px-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-canvas">
          <LineChart size={22} strokeWidth={2.4} aria-hidden />
        </span>
        <div>
          <h1 className="display text-lg font-semibold leading-tight text-ink">Arc Quant Agent</h1>
          <p className="text-xs text-subtle">AI phân tích BTC/USD và tự giao dịch bằng USDC</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted sm:flex">
          <NetworkArc variant="branded" size={16} /> Arc Testnet
        </span>
        <ConnectKitButton />
      </div>
    </header>
  )
}
