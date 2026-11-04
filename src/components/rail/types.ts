/**
 * One entry in the rail, from any source. IDs are platform-scoped
 * ("twitch:71092938") so a second platform's entries cannot collide with
 * Twitch's when a YouTube or Kick section is added.
 */
export interface RailEntry {
  id: string
  displayName: string
  /** Empty string when unknown — the card falls back to an initial circle. */
  avatarUrl: string
  /** In-app route, e.g. "/twitch/xqc". Never an external URL. */
  href: string
  isLive: boolean
  viewerCount: number | null
  streamTitle: string | null
  gameName: string | null
  /** ISO 8601; drives the uptime readout. */
  startedAt: string | null
}

/**
 * `'top'` is a member deliberately. The design accommodates a top rail; no
 * rollover layout is built. An explicit, documented gap keeps the seam
 * visible instead of hiding it behind a silent fallthrough.
 */
export type RailPosition = 'left' | 'right' | 'top'
