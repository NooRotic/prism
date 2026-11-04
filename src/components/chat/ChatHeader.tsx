import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import type { DockSide } from './chatPlacement'

interface ChatHeaderProps {
  side: DockSide
  onHide: () => void
  onSwapSide: () => void
}

const buttonClass = 'rounded-md p-1 transition-colors hover:bg-white/5'

/** Placement controls. Hidden below md, where the layout is always stacked. */
export default function ChatHeader({ side, onHide, onSwapSide }: ChatHeaderProps) {
  const target: DockSide = side === 'left' ? 'right' : 'left'
  return (
    <div
      data-testid="chat-header"
      className="hidden md:flex items-center justify-between gap-1 px-2 py-1"
      style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}
    >
      <span className="text-xs">Chat</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSwapSide}
          aria-label={`Move chat to the ${target}`}
          title={`Move chat to the ${target}`}
          className={buttonClass}
        >
          {target === 'left' ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
        </button>
        <button
          type="button"
          onClick={onHide}
          aria-label="Hide chat"
          title="Hide chat"
          className={buttonClass}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
