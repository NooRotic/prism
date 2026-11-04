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
 *
 * Colours are measured, not eyeballed (against the #050507 page): icon 12.2:1 on
 * the lighter fill, border 5.9:1, accent hover 15:1. The earlier card colours
 * gave a 2.7:1 icon and a 1.2:1 border, which made the strip nearly invisible.
 */
export default function ChatTab({ side, label, onClick }: ChatTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-side={side}
      className={`shrink-0 flex items-center justify-center w-full h-9 mt-2 md:mt-0 md:w-8 md:h-auto rounded-lg border transition-colors bg-[var(--border-accent)] border-[color:var(--text-secondary)] text-[color:var(--text-primary)] hover:border-[color:var(--accent-green)] hover:text-[color:var(--accent-green)] focus-visible:border-[color:var(--accent-green)] focus-visible:text-[color:var(--accent-green)] focus-visible:outline-none ${
        side === 'right' ? 'md:ml-2' : 'md:mr-2'
      }`}
    >
      <MessageSquare size={16} />
    </button>
  )
}
