import { Cast } from 'lucide-react'
import { STRIP_BUTTON_LOOK } from '../chat/ChatTab'

interface CastButtonProps {
  /** Why this stream cannot be cast, or null when it can. */
  reason: string | null
  /** The picker is open, or the TV has not answered yet. */
  connecting: boolean
  onStart(): void
}

/** Sends the page's stream to a TV: Chrome's own picker opens. Shown only when a device was found (the page decides). */
export default function CastButton({ reason, connecting, onStart }: CastButtonProps) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={reason !== null}
      aria-label="Cast to a TV"
      aria-busy={connecting}
      title={reason ?? (connecting ? 'Connecting to the TV…' : 'Cast to a TV')}
      className={`${STRIP_BUTTON_LOOK} h-9 w-9 disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <Cast size={16} />
    </button>
  )
}
