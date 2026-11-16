import { formatBehindLive } from '../../lib/liveWindow'

interface LiveSeekBarProps {
  /** Length of the rewind window, in seconds. */
  windowSeconds: number
  /** How far behind live the playhead is, in seconds (0 at the live edge). */
  behindLive: number
  /** The viewer dragged the bar to this many seconds behind live. */
  onSeek: (secondsBehind: number) => void
  /** The viewer pressed LIVE. */
  onGoLive: () => void
}

/**
 * The rewind bar under a live DASH stream. The browser's own controls show no timeline for a live stream (its duration
 * is infinite), so this draws one from the window dash.js reports. Left is the oldest point still available, right is live.
 */
export default function LiveSeekBar({ windowSeconds, behindLive, onSeek, onGoLive }: LiveSeekBarProps) {
  const atLive = behindLive < 2
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 text-xs"
      style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)' }}
    >
      <button
        type="button"
        onClick={onGoLive}
        aria-label="Go to live"
        disabled={atLive}
        className="cursor-pointer rounded px-2 py-0.5 font-mono font-semibold focus-visible:outline-2 focus-visible:outline-[var(--accent-green)] disabled:cursor-default"
        style={{
          background: atLive ? 'var(--accent-green)' : 'transparent',
          color: atLive ? '#000' : 'var(--text-primary)',
          border: '1px solid var(--accent-green)',
        }}
      >
        LIVE
      </button>
      <input
        type="range"
        aria-label="Rewind live stream"
        min={0}
        max={Math.round(windowSeconds)}
        step={1}
        // The bar runs oldest to live, so the value is how far from the oldest point, not how far behind live.
        value={Math.round(windowSeconds - behindLive)}
        onChange={(event) => onSeek(windowSeconds - Number(event.target.value))}
        className="min-w-0 flex-1 cursor-pointer"
        style={{ accentColor: 'var(--accent-green)' }}
      />
      <span className="w-14 text-right font-mono" aria-live="off">
        {formatBehindLive(behindLive)}
      </span>
    </div>
  )
}
