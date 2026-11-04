import { MessageSquare } from 'lucide-react'
import type { DockSide } from './chatPlacement'

/**
 * The look of every button in the strip beside the player. Colours are measured,
 * not eyeballed (against the #050507 page): icon 12.2:1 on the lighter fill,
 * border 5.9:1, accent hover 15:1. The earlier card colours gave a 2.7:1 icon and
 * a 1.2:1 border, which made the strip nearly invisible. A literal string, since
 * Tailwind cannot see classes built from pieces.
 */
export const STRIP_BUTTON_LOOK =
  'flex items-center justify-center rounded-lg border transition-colors bg-[var(--border-accent)] border-[color:var(--text-secondary)] text-[color:var(--text-primary)] hover:border-[color:var(--accent-green)] hover:text-[color:var(--accent-green)] focus-visible:border-[color:var(--accent-green)] focus-visible:text-[color:var(--accent-green)] focus-visible:outline-none'

interface ChatTabProps {
  side: DockSide
  label: string
  onClick: () => void
}

/**
 * The way back when the chat is hidden or popped out: the long button in the
 * strip beside the player, never drawn over the embed. It carries no layout of
 * its own; ChatStrip owns the column so it can share it with the fill and
 * fullscreen buttons. Visible at every width, because it is the restore
 * control, not a placement control.
 */
export default function ChatTab({ side, label, onClick }: ChatTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-side={side}
      className={`${STRIP_BUTTON_LOOK} flex-1 min-h-8 min-w-0`}
    >
      <MessageSquare size={16} />
    </button>
  )
}
