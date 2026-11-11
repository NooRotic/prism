import { STORAGE_KEYS } from '../config/storageKeys'
import { TWITCHTRACKER_ENABLED } from '../config/twitchTracker'

/** TwitchTracker's 30-day figures for one channel. A field it did not give is null, never 0. */
export interface TrackerSummary {
  /** Position by hours watched. */
  rank: number | null
  minutesStreamed: number | null
  avgViewers: number | null
  maxViewers: number | null
  hoursWatched: number | null
  /** Net follower change over the 30 days; negative when the channel lost followers. */
  followersGained: number | null
  followersTotal: number | null
}

interface CacheRecord {
  fetchedAt: number
  /** Null records TwitchTracker's answer that it knows nothing about the channel. */
  summary: TrackerSummary | null
}

const SUMMARY_URL = 'https://twitchtracker.com/api/channels/summary/'
const LOGIN_PATTERN = /^[A-Za-z0-9_]{1,25}$/
const SUMMARY_TTL_MS = 6 * 60 * 60 * 1000
const EMPTY_TTL_MS = 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10_000

const SUMMARY_KEYS = [
  'rank',
  'minutesStreamed',
  'avgViewers',
  'maxViewers',
  'hoursWatched',
  'followersGained',
  'followersTotal',
] as const

// Session state, so a blocked or failing TwitchTracker is asked as little as possible.
let rateLimited = false
const failed = new Set<string>()
const inFlight = new Map<string, Promise<TrackerSummary | null>>()

/** Clears the per-session memory (the 429 stop, failed logins, requests in flight). For tests. */
export function resetTrackerSession(): void {
  rateLimited = false
  failed.clear()
  inFlight.clear()
}

/**
 * True when this session has no way to get an answer for the login: the client is switched off,
 * the login is malformed, TwitchTracker rate-limited us, or this login's request failed. A null
 * summary with this false means TwitchTracker answered and does not track the channel. The two
 * look the same in the figures (a dash) but not in what the page may say about the channel.
 */
export function trackerUnavailable(login: string): boolean {
  return !TWITCHTRACKER_ENABLED || !LOGIN_PATTERN.test(login) || rateLimited || failed.has(login.toLowerCase())
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Maps TwitchTracker's answer to a summary; null when it is empty or not the expected shape. */
export function parseTrackerSummary(json: unknown): TrackerSummary | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null
  const raw = json as Record<string, unknown>
  const summary: TrackerSummary = {
    rank: numberOrNull(raw.rank),
    minutesStreamed: numberOrNull(raw.minutes_streamed),
    avgViewers: numberOrNull(raw.avg_viewers),
    maxViewers: numberOrNull(raw.max_viewers),
    hoursWatched: numberOrNull(raw.hours_watched),
    followersGained: numberOrNull(raw.followers),
    followersTotal: numberOrNull(raw.followers_total),
  }
  return SUMMARY_KEYS.every((key) => summary[key] === null) ? null : summary
}

function isSummary(value: unknown): value is TrackerSummary {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return SUMMARY_KEYS.every((key) => record[key] === null || typeof record[key] === 'number')
}

function cacheKey(login: string): string {
  return `${STORAGE_KEYS.LOCAL_TWITCHTRACKER_CACHE_PREFIX}${login}`
}

/** The cached record for a lower-cased login while it is still fresh, otherwise null. */
function readCache(login: string, now: number): CacheRecord | null {
  try {
    const raw = localStorage.getItem(cacheKey(login))
    if (raw === null) return null
    const record = JSON.parse(raw) as Partial<CacheRecord> | null
    if (typeof record !== 'object' || record === null) return null
    const { fetchedAt, summary } = record
    if (typeof fetchedAt !== 'number' || !Number.isFinite(fetchedAt)) return null
    if (summary !== null && !isSummary(summary)) return null
    const age = now - fetchedAt
    const ttl = summary === null ? EMPTY_TTL_MS : SUMMARY_TTL_MS
    return age >= 0 && age < ttl ? { fetchedAt, summary: summary ?? null } : null
  } catch {
    return null
  }
}

function writeCache(login: string, record: CacheRecord): void {
  try {
    localStorage.setItem(cacheKey(login), JSON.stringify(record))
  } catch {
    // The cache only saves requests; the figures still show without it.
  }
}

async function request(login: string, now: number): Promise<TrackerSummary | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${SUMMARY_URL}${login}`, { signal: controller.signal })
    if (response.status === 429) {
      rateLimited = true
      return null
    }
    if (!response.ok) {
      failed.add(login)
      return null
    }
    const summary = parseTrackerSummary(await response.json())
    writeCache(login, { fetchedAt: now, summary })
    return summary
  } catch {
    failed.add(login)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * TwitchTracker's 30-day summary for a channel, or null when there is nothing to show: the
 * client is switched off, the login is malformed, TwitchTracker does not know the channel, or
 * anything at all went wrong. It never throws and never sends credentials. Real answers are
 * cached for 6 hours and empty ones for 1 hour; failures are not cached, but a login that failed
 * is not asked again this session, and a 429 stops every request for the rest of it.
 */
export async function fetchTrackerSummary(login: string, now: number = Date.now()): Promise<TrackerSummary | null> {
  if (!TWITCHTRACKER_ENABLED || !LOGIN_PATTERN.test(login)) return null
  const key = login.toLowerCase()

  const cached = readCache(key, now)
  if (cached) return cached.summary
  if (rateLimited || failed.has(key)) return null

  const pending = inFlight.get(key)
  if (pending) return pending

  const started = request(key, now).finally(() => inFlight.delete(key))
  inFlight.set(key, started)
  return started
}
