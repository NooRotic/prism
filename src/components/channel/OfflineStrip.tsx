import { formatAgo } from '../../lib/offlineLayout'

interface OfflineStripProps {
  /** When the channel last stopped streaming, in ms; null when that is not known. */
  lastStreamedAt: number | null
  now: number
  /** The player is folded away. The button that unfolds it shows only then. */
  folded: boolean
  onShowPlayer: () => void
}

/** One line standing in for the player of an offline channel: its status, when it last streamed, and a way to unfold the player. */
export default function OfflineStrip({ lastStreamedAt, now, folded, onShowPlayer }: OfflineStripProps) {
  return (
    <div
      role="status"
      data-testid="offline-strip"
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <span className="flex min-w-0 items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: 'var(--text-muted)' }}
        />
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          Offline
        </span>
        {lastStreamedAt !== null && <span className="truncate">· last live {formatAgo(lastStreamedAt, now)}</span>}
      </span>
      {folded && (
        <button
          type="button"
          onClick={onShowPlayer}
          className="min-h-9 shrink-0 rounded-md px-3 text-xs"
          style={{ border: '1px solid var(--border-accent)', color: 'var(--text-primary)' }}
        >
          Show player
        </button>
      )}
    </div>
  )
}
