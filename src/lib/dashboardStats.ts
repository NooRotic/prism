import type { EnrichedFollow } from './followsStore'
import { sortNewestLiveFirst } from './sortLiveFollows'

/** A live follow that started this recently counts as "just went live". */
export const JUST_WENT_LIVE_MS = 30 * 60 * 1000

const MINUTE_MS = 60_000

/** Elapsed time as the dashboard shows it: `4m`, `1h 05m`, `4h`. Never negative. */
export function formatCompactDuration(ms: number): string {
  const totalMinutes = Math.floor(Math.max(0, ms) / MINUTE_MS)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

/** One decimal, with a trailing `.0` dropped. */
function trimDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** A count as the dashboard shows it: `999`, `1.2k`, `8.1k`, `1.3M`. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n)
  const thousands = n / 1000
  // 999,950 and up would round to "1000k"; call that a million instead.
  if (n >= 1_000_000 || Math.round(thousands * 10) / 10 >= 1000) {
    return `${trimDecimal(n / 1_000_000)}M`
  }
  return `${trimDecimal(thousands)}k`
}

/** How long a follow has been live, or null when its start time is missing or unreadable. */
function uptimeMs(follow: EnrichedFollow, now: number): number | null {
  const started = follow.startedAt ? Date.parse(follow.startedAt) : NaN
  return Number.isNaN(started) ? null : Math.max(0, now - started)
}

export interface FollowStats {
  liveCount: number
  loadedCount: number
  watching: number
  typicalUptimeMs: number | null
  justWentLive: number
  longest: { name: string; ms: number } | null
  languages: { language: string; count: number }[]
  oldestLive: { name: string; year: number } | null
}

function median(sortedAscending: number[]): number | null {
  if (sortedAscending.length === 0) return null
  const middle = Math.floor(sortedAscending.length / 2)
  if (sortedAscending.length % 2 === 1) return sortedAscending[middle]
  return Math.round((sortedAscending[middle - 1] + sortedAscending[middle]) / 2)
}

/** The figures in the dashboard's stat chips, from the follows PRISM has loaded. */
export function computeFollowStats(follows: EnrichedFollow[], now: number): FollowStats {
  const live = follows.filter((f) => f.isLive)

  const uptimes = live.flatMap((f) => {
    const ms = uptimeMs(f, now)
    return ms === null ? [] : [{ name: f.broadcaster_name, ms }]
  })

  let longest: FollowStats['longest'] = null
  for (const u of uptimes) {
    if (longest === null || u.ms > longest.ms) longest = u
  }

  const languageCounts = new Map<string, number>()
  for (const f of live) {
    if (f.language) languageCounts.set(f.language, (languageCounts.get(f.language) ?? 0) + 1)
  }
  const languages = [...languageCounts.entries()]
    .map(([language, count]) => ({ language, count }))
    .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language))

  let oldestLive: FollowStats['oldestLive'] = null
  let oldestTime = Infinity
  for (const f of live) {
    const followed = Date.parse(f.followed_at)
    if (Number.isNaN(followed) || followed >= oldestTime) continue
    oldestTime = followed
    oldestLive = { name: f.broadcaster_name, year: new Date(followed).getUTCFullYear() }
  }

  return {
    liveCount: live.length,
    loadedCount: follows.length,
    watching: live.reduce((sum, f) => sum + (f.viewerCount ?? 0), 0),
    typicalUptimeMs: median(uptimes.map((u) => u.ms).sort((a, b) => a - b)),
    justWentLive: uptimes.filter((u) => u.ms <= JUST_WENT_LIVE_MS).length,
    longest,
    languages,
    oldestLive,
  }
}

export interface CategoryRow {
  name: string
  liveCount: number
  viewers: number
}

const NO_CATEGORY = 'No category'

/** Live follows grouped by category, the one with the most viewers first. */
export function groupCategories(follows: EnrichedFollow[]): CategoryRow[] {
  const rows = new Map<string, CategoryRow>()
  for (const f of follows) {
    if (!f.isLive) continue
    const name = f.gameName?.trim() || NO_CATEGORY
    const row = rows.get(name) ?? { name, liveCount: 0, viewers: 0 }
    row.liveCount += 1
    row.viewers += f.viewerCount ?? 0
    rows.set(name, row)
  }
  return [...rows.values()].sort((a, b) => b.viewers - a.viewers || a.name.localeCompare(b.name))
}

/** The live follows that went live most recently, whatever their uptime. */
export function recentlyStarted(follows: EnrichedFollow[], limit = 3): EnrichedFollow[] {
  return sortNewestLiveFirst(follows.filter((f) => f.isLive)).slice(0, limit)
}

/** The live follows with the most viewers. */
export function mostWatched(follows: EnrichedFollow[], limit = 3): EnrichedFollow[] {
  return follows
    .filter((f) => f.isLive)
    .sort((a, b) => (b.viewerCount ?? 0) - (a.viewerCount ?? 0))
    .slice(0, limit)
}
