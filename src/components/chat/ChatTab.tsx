import { MessageSquare } from 'lucide-react'
import type { DockSide } from './chatPlacement'

interface ChatTabProps {
  side: DockSide
  label: string
  onClick: () => void
}

/**
 * The way back when the chat is hidden or popped out. It is a column of its own
 * beside the player (a full-width bar when stacked), never drawn over the
 * embed. Visible at every width, because it is the restore control, not a
 * placement control.
 */
export default function ChatTab({ side, label, onClick }: ChatTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-side={side}
      className={`shrink-0 flex items-center justify-center w-full h-9 mt-2 md:mt-0 md:w-8 md:h-auto rounded-lg transition-colors hover:bg-white/5 ${
        side === 'right' ? 'md:ml-2' : 'md:mr-2'
      }`}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
        color: 'var(--text-muted)',
      }}
    >
      <MessageSquare size={16} />
    </button>
  )
}
