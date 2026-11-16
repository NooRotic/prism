/** A live stream's rewind window, in seconds, as the engine reports it (dash.js `getDvrWindow()`). */
export interface DvrWindowLike {
  start: number
  end: number
}

/** Where the viewer is inside that window. `behindLive` is 0 at the live edge. */
export interface LiveScrubState {
  windowSeconds: number
  behindLive: number
}

/** A window shorter than this is only the player's own live latency, not something worth a seek bar. */
export const MIN_SCRUB_WINDOW_SECONDS = 30

/**
 * Whether a live stream can be scrubbed, and how far behind live the playhead is. Returns null when the engine reports no
 * usable window (a stream that is not live, a window that is too short, or numbers that are not finite).
 */
export function liveScrubState(
  window: DvrWindowLike | null | undefined,
  currentTime: number,
  minWindowSeconds: number = MIN_SCRUB_WINDOW_SECONDS,
): LiveScrubState | null {
  if (!window || !Number.isFinite(window.start) || !Number.isFinite(window.end) || !Number.isFinite(currentTime)) return null
  const windowSeconds = window.end - window.start
  if (windowSeconds < minWindowSeconds) return null
  const behindLive = Math.min(windowSeconds, Math.max(0, window.end - currentTime))
  return { windowSeconds, behindLive }
}

/** The playhead time for "this many seconds behind live". */
export function timeBehindLive(window: DvrWindowLike, secondsBehind: number): number {
  const windowSeconds = window.end - window.start
  return window.end - Math.min(windowSeconds, Math.max(0, secondsBehind))
}

/** "LIVE" at the edge, otherwise "-1:05" / "-12:30" (minutes:seconds behind live). */
export function formatBehindLive(secondsBehind: number): string {
  if (secondsBehind < 2) return 'LIVE'
  const total = Math.round(secondsBehind)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `-${minutes}:${String(seconds).padStart(2, '0')}`
}
