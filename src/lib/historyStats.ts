import type { TwitchVideo } from '../types/twitch'
import { parseTwitchDuration } from './twitchDuration'

/** One local calendar day of a chart. A null `value` means "not known", which is not the same as 0. */
export interface DayBucket {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string
  /** Local midnight at the start of that day, in ms. */
  at: number
  value: number | null
}

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_DAYS = 30

/** The local calendar day of a timestamp as `YYYY-MM-DD`. */
export function localDayKey(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Local-time getters throughout (no UTC maths): the viewer sees days as they live them, and
// building each midnight with the Date constructor stays correct across a clock change.
function startOfLocalDay(ms: number, daysBack = 0): number {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBack).getTime()
}

function startOfNextLocalDay(ms: number): number {
  return startOfLocalDay(ms, -1)
}

/** Local midnights of the last `days` days, oldest first, ending with today. */
function dayStarts(now: number, days: number): number[] {
  const starts: number[] = []
  for (let back = days - 1; back >= 0; back--) starts.push(startOfLocalDay(now, back))
  return starts
}

/** The start times of the archives (past broadcasts) among the videos, skipping unreadable dates. */
function archiveStarts(videos: TwitchVideo[]): { video: TwitchVideo; startedAt: number }[] {
  const archives: { video: TwitchVideo; startedAt: number }[] = []
  for (const video of videos) {
    if (video.type !== 'archive') continue
    const startedAt = Date.parse(video.created_at)
    if (!Number.isNaN(startedAt)) archives.push({ video, startedAt })
  }
  return archives
}

/**
 * New followers per local day for the last `days` days. Days that end before `coveredFromMs`
 * (where the follower read stopped, when it was cut short) are null; the day it stopped on is
 * only partly read but still counted.
 */
export function bucketFollowersByDay(
  dates: string[],
  now: number,
  days: number = DEFAULT_DAYS,
  coveredFromMs?: number,
): DayBucket[] {
  const counts = new Map<string, number>()
  for (const date of dates) {
    const followedAt = Date.parse(date)
    if (Number.isNaN(followedAt)) continue
    const key = localDayKey(followedAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return dayStarts(now, days).map((at) => {
    const day = localDayKey(at)
    const unknown = coveredFromMs !== undefined && startOfNextLocalDay(at) <= coveredFromMs
    return { day, at, value: unknown ? null : (counts.get(day) ?? 0) }
  })
}

/**
 * Hours streamed per local day, from the archives. A broadcast counts wholly for the day it
 * started. Days before the oldest archive's day are null, because the recordings do not reach
 * back that far; later days with no archive are 0.
 */
export function bucketHoursByDay(videos: TwitchVideo[], now: number, days: number = DEFAULT_DAYS): DayBucket[] {
  const archives = archiveStarts(videos)
  const oldestDay =
    archives.length > 0 ? startOfLocalDay(Math.min(...archives.map((a) => a.startedAt))) : null

  const hours = new Map<string, number>()
  for (const { video, startedAt } of archives) {
    const key = localDayKey(startedAt)
    hours.set(key, (hours.get(key) ?? 0) + parseTwitchDuration(video.duration))
  }

  return dayStarts(now, days).map((at) => {
    const day = localDayKey(at)
    return { day, at, value: oldestDay === null || at < oldestDay ? null : (hours.get(day) ?? 0) }
  })
}

/** Views of each archive that started inside the window, oldest first, one point per broadcast. */
export function viewsPerBroadcast(
  videos: TwitchVideo[],
  now: number,
  days: number = DEFAULT_DAYS,
): { at: number; value: number }[] {
  const windowStart = startOfLocalDay(now, days - 1)
  const windowEnd = startOfNextLocalDay(now)
  return archiveStarts(videos)
    .filter(({ startedAt }) => startedAt >= windowStart && startedAt < windowEnd)
    .map(({ video, startedAt }) => ({ at: startedAt, value: video.view_count }))
    .sort((a, b) => a.at - b.at)
}

/** Whole days from the oldest archive to now (how far back the recordings go), or null with none. */
export function coverageDays(videos: TwitchVideo[], now: number): number | null {
  const archives = archiveStarts(videos)
  if (archives.length === 0) return null
  const oldest = Math.min(...archives.map((a) => a.startedAt))
  return Math.max(0, Math.floor((now - oldest) / DAY_MS))
}
