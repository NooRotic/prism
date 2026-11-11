import { formatAgo } from '../../lib/offlineLayout'

interface OfflineStripProps {
  /** When the channel last stopped streaming, in ms; null when that is not known. */
  lastStreamedAt: number | null
  now: number
  /** The player is folded away. The button that unfolds it shows only then. */
  folded: boolean
  onShowPlayer: () => void
  /** The channel went live while the viewer kept the offline layout (they were watching something). */
  live?: boolean
  /** Moves the player to the live stream. Given only when the player is on something else. */
  onWatchLive?: () => void
}

const BUTTON = 'min-h-9 shrink-0 rounded-md px-3 text-xs'
const BUTTON_STYLE = { border: '1px solid var(--border-accent)', color: 'var(--text-primary)' }

/**
 * One line standing in for the player of an offline channel: its status, when it last streamed,
 * and a way to unfold the player. If the channel goes live while the viewer is watching a
 * recording it says so and offers the way to the live stream, without moving anything.
 */
export default function OfflineStrip({ lastStreamedAt, now, folded, onShowPlayer, live = false, onWatchLive }: OfflineStripProps) {
  return (
    <div
      data-testid="offline-strip"
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <span className="flex min-w-0 items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: live ? 'var(--accent-green)' : 'var(--text-muted)' }}
        />
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
          {live ? 'Live now' : 'Offline'}
        </span>
        {!live && lastStreamedAt !== null && (
          <span className="truncate">· last live {formatAgo(lastStreamedAt, now)}</span>
        )}
      </span>
      {live && onWatchLive && (
        <button type="button" onClick={onWatchLive} className={BUTTON} style={BUTTON_STYLE}>
          Watch live
        </button>
      )}
      {!live && folded && (
        <button type="button" onClick={onShowPlayer} className={BUTTON} style={BUTTON_STYLE}>
          Show player
        </button>
      )}
    </div>
  )
}
