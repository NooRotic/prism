/**
 * Module-level playback metrics store.
 *
 * **Why not React state / AppContext**: QoE metrics (bitrate, buffer
 * length, dropped frames, etc.) update at 1Hz. If we pushed them
 * through AppContext, every component reading from the context would
 * re-render 60 times/minute even if they don't care about metrics.
 * The DebugPanel is the only consumer today, and it only renders
 * when the user opts into debug mode — a ~30 second inspection
 * session shouldn't cost 1,800 unrelated re-renders.
 *
 * **Pattern**: a plain mutable module-scoped object + pub/sub
 * listener list. Players push metrics via `setPlayerMetrics()` from
 * inside their own setIntervals. DebugPanel subscribes on mount to
 * get updates as they arrive, and unsubscribes on unmount. When the
 * panel is closed, `setPlayerMetrics()` has zero observers so the
 * setter is effectively a no-op (still updates the module state,
 * just doesn't notify anyone).
 *
 * **Lifecycle**: players are expected to call `setPlayerMetrics(null)`
 * on unmount to clear stale data — otherwise the DebugPanel would
 * show bitrates/buffer info for a player that's been torn down.
 */

export interface PlaybackMetrics {
  /** Millisecond timestamp of last update — used for freshness indicator. */
  updatedAt: number
  /** Which engine produced these metrics. */
  engine: 'videojs' | 'dashjs' | 'twitch-sdk' | 'twitch-iframe' | 'reactplayer'

  // ─── Universal (where available) ──────────────────────────────
  currentTime: number | null
  duration: number | null
  paused: boolean | null
  muted: boolean | null
  volume: number | null

  // ─── Quality ──────────────────────────────────────────────────
  /** Human-readable quality label: 'auto', '1080p', 'hd720', etc. */
  quality: string | null
  /** Current bitrate in bits per second. */
  bitrate: number | null
  /** 'WIDTHxHEIGHT' e.g. '1920x1080'. */
  resolution: string | null

  // ─── Buffer + network ─────────────────────────────────────────
  /** Seconds ahead of current playhead that are buffered. */
  bufferLength: number | null
  /** Count of dropped frames since playback started. */
  droppedFrames: number | null
  /** Bytes transferred by the media pipeline since playback started. */
  bytesTransferred: number | null
}

type Listener = (metrics: PlaybackMetrics | null) => void

let current: PlaybackMetrics | null = null
const listeners = new Set<Listener>()

// Track tab visibility so we can skip notifying listeners (and
// triggering React re-renders) while the tab is in the background.
// The stored value is still updated so it's fresh on tab return.
let tabVisible = typeof document !== 'undefined'
  ? document.visibilityState === 'visible'
  : true

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    tabVisible = document.visibilityState === 'visible'
  })
}

/**
 * Whether the browser tab is currently visible. Players should
 * check this at the top of their 1Hz metric polling interval and
 * bail early when false — avoids querying player APIs for metrics
 * that nobody will see.
 */
export function isTabVisible(): boolean {
  return tabVisible
}

// ─── Rolling history for sparkline charts ───────────────────────
// Stores the last HISTORY_SIZE samples (60 = 60 seconds at 1Hz).
// Each entry holds the values relevant for sparklines. Dropped
// frames is stored as a per-second delta (the raw value is a
// monotonic counter from playback start).

const HISTORY_SIZE = 60

export interface MetricsSample {
  bitrate: number | null
  bufferLength: number | null
  droppedFramesDelta: number | null
}

const history: MetricsSample[] = []
let prevDroppedFrames: number | null = null

export function getMetricsHistory(): readonly MetricsSample[] {
  return history
}

function pushHistory(metrics: PlaybackMetrics): void {
  const droppedDelta =
    metrics.droppedFrames !== null && prevDroppedFrames !== null
      ? metrics.droppedFrames - prevDroppedFrames
      : null
  prevDroppedFrames = metrics.droppedFrames

  history.push({
    bitrate: metrics.bitrate,
    bufferLength: metrics.bufferLength,
    droppedFramesDelta: droppedDelta,
  })
  if (history.length > HISTORY_SIZE) history.shift()
}

function clearHistory(): void {
  history.length = 0
  prevDroppedFrames = null
}

/**
 * Replace the current metrics snapshot. Pass `null` to clear (e.g.
 * on player unmount). Notifies all subscribers synchronously.
 */
export function setPlayerMetrics(next: PlaybackMetrics | null): void {
  current = next
  if (next !== null) {
    pushHistory(next)
  } else {
    clearHistory()
  }
  // Skip listener notifications while the tab is hidden — saves
  // React re-renders in DebugPanel at 1Hz for no visible benefit.
  if (!tabVisible && next !== null) return
  for (const listener of listeners) {
    try {
      listener(next)
    } catch {
      // Never let one buggy listener break another.
    }
  }
}

/**
 * Read the current metrics snapshot without subscribing. Useful for
 * one-off reads; prefer `subscribePlayerMetrics` for live updates.
 */
export function getPlayerMetrics(): PlaybackMetrics | null {
  return current
}

/**
 * Subscribe to metrics updates. Returns an unsubscribe function.
 * The listener is called synchronously from setPlayerMetrics, so
 * consumers should batch React state updates if they're in a
 * high-frequency scenario.
 */
export function subscribePlayerMetrics(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Build a new metrics snapshot with sensible defaults. Useful for
 * player wrappers that only report a few fields — the rest stay null.
 */
export function makeMetrics(
  engine: PlaybackMetrics['engine'],
  partial: Partial<PlaybackMetrics> = {},
): PlaybackMetrics {
  return {
    updatedAt: Date.now(),
    engine,
    currentTime: null,
    duration: null,
    paused: null,
    muted: null,
    volume: null,
    quality: null,
    bitrate: null,
    resolution: null,
    bufferLength: null,
    droppedFrames: null,
    bytesTransferred: null,
    ...partial,
  }
}
