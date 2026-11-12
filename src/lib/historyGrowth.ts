import type { HistoryRow } from './historyApi'

/**
 * Helpers over a channel's daily history. History dates are UTC calendar days (`YYYY-MM-DD`), so every
 * calculation and every label here works in UTC: a viewer in the Americas must not see a day shifted.
 *
 * Only total followers and rank are point-in-time figures. TwitchTracker's viewers, hours watched and minutes
 * streamed are trailing 30-day windows, so a "growth" figure for them would compare two heavily overlapping
 * windows. That is why growthOver accepts only the two point-in-time keys.
 */

const DAY_MS = 86_400_000
const STALE_AFTER_MS = 48 * 60 * 60 * 1000

export type SeriesKey = 'followersTotal' | 'rank' | 'avgViewers' | 'maxViewers' | 'hoursWatched'

export interface SeriesPoint {
  /** UTC date, `YYYY-MM-DD`. */
  date: string
  /** Midnight UTC at the start of that date, in ms. */
  at: number
  value: number | null
}

const HISTORY_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Titles for charts of TwitchTracker's trailing 30-day figures: they must never read as daily values. */
export const ROLLING_TITLES = {
  viewers: 'Average and peak viewers, rolling 30 days',
  hours: 'Hours watched, rolling 30 days',
} as const

const atOf = (date: string): number => Date.parse(`${date}T00:00:00Z`)
const dateOf = (at: number): string => new Date(at).toISOString().slice(0, 10)

/**
 * One point per UTC day from the first row to the last, oldest first. A day with no row, or whose row has
 * no value, is a null point, so a chart draws a gap instead of joining across it.
 */
export function seriesOf(rows: HistoryRow[], key: SeriesKey): SeriesPoint[] {
  if (rows.length === 0) return []
  const byDate = new Map(rows.map((r) => [r.date, r[key]] as const))
  const dates = [...byDate.keys()].sort()
  const first = atOf(dates[0])
  const last = atOf(dates[dates.length - 1])

  const points: SeriesPoint[] = []
  for (let at = first; at <= last; at += DAY_MS) {
    const date = dateOf(at)
    points.push({ date, at, value: byDate.get(date) ?? null })
  }
  return points
}

/**
 * How much a point-in-time figure changed over the last `days` days: the newest value minus the value on the
 * newest row at or before (newest date - days). Null when the history does not reach back that far or the
 * figure was never recorded. For rank a negative delta means the channel moved up.
 */
export function growthOver(
  rows: HistoryRow[],
  key: 'followersTotal' | 'rank',
  days: 7 | 30 | 90,
): { delta: number; from: string; to: string } | null {
  const known = rows
    .filter((r): r is HistoryRow & Record<typeof key, number> => r[key] !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (known.length === 0) return null

  const latest = known[known.length - 1]
  const target = dateOf(atOf(latest.date) - days * DAY_MS)
  const earlier = [...known].reverse().find((r) => r.date <= target)
  if (earlier === undefined) return null

  return { delta: latest[key] - earlier[key], from: earlier.date, to: latest.date }
}

/** True when the newest good answer is more than 48 hours old, or its time is missing or unreadable. */
export function isStale(lastUpdated: string | null, now: number): boolean {
  if (lastUpdated === null) return true
  const updated = Date.parse(lastUpdated)
  return Number.isNaN(updated) || now - updated > STALE_AFTER_MS
}

/** A UTC calendar date as month and day: `Nov 12`. */
export function formatHistoryDate(date: string): string {
  return HISTORY_DATE.format(atOf(date))
}

/** The "tracking since" label for a channel: `Nov 12`. */
export function formatTrackingSince(trackedSince: string): string {
  return formatHistoryDate(trackedSince)
}
