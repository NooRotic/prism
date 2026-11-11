import { getFollowerDates, getVideos } from '../lib/twitchApi'
import {
  bucketFollowersByDay,
  bucketHoursByDay,
  coverageDays,
  viewsPerBroadcast,
  type DayBucket,
} from '../lib/historyStats'
import type { TwitchVideo } from '../types/twitch'
import { useSection, type Section } from './streamerSection'

/** New followers per local day over the last 30 days. `source` tells this apart from stored history later. */
export interface FollowerHistory {
  buckets: DayBucket[]
  /** The channel's all-time follower count. */
  total: number
  /** True when the page limit stopped the read, so the earliest days are unknown (null buckets). */
  reachedCap: boolean
  source: 'twitch'
}

/** What the broadcast recordings say about the last 30 days. */
export interface VideoHistory {
  /** Views of each broadcast, oldest first. */
  views: { at: number; value: number }[]
  /** Hours streamed per local day. */
  hours: DayBucket[]
  /** How many whole days back the recordings go, or null when there are none. */
  coverageDays: number | null
  source: 'twitch'
}

interface FollowerRead {
  dates: string[]
  total: number
  reachedCap: boolean
}

interface CacheEntry<T> {
  at: number
  promise: Promise<T>
}

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 30
const MAX_FOLLOWER_PAGES = 10
const VIDEOS_PER_REQUEST = 100
const CACHE_TTL_MS = 15 * 60 * 1000

// What Twitch said, per streamer id, for 15 minutes. The raw answers are cached, not the day
// buckets, so a mount just after midnight still draws today. The promise is cached so mounts that
// start together share one request; a failure removes its entry so the next mount tries again.
const followerCache = new Map<string, CacheEntry<FollowerRead>>()
const videoCache = new Map<string, CacheEntry<TwitchVideo[]>>()

/** Empties the 15-minute cache. For tests. */
export function clearHistoryCache(): void {
  followerCache.clear()
  videoCache.clear()
}

function cached<T>(cache: Map<string, CacheEntry<T>>, id: string, fetchFresh: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(id)
  if (hit && now - hit.at >= 0 && now - hit.at < CACHE_TTL_MS) return hit.promise

  const entry: CacheEntry<T> = { at: now, promise: fetchFresh() }
  cache.set(id, entry)
  entry.promise.catch(() => {
    if (cache.get(id) === entry) cache.delete(id)
  })
  return entry.promise
}

async function loadFollowers(broadcasterId: string): Promise<FollowerHistory> {
  const read = await cached(followerCache, broadcasterId, () =>
    getFollowerDates(broadcasterId, Date.now() - WINDOW_DAYS * DAY_MS, MAX_FOLLOWER_PAGES),
  )
  const earliestRead = read.dates.length > 0 ? Date.parse(read.dates[read.dates.length - 1]) : NaN
  const coveredFrom = read.reachedCap && !Number.isNaN(earliestRead) ? earliestRead : undefined
  return {
    buckets: bucketFollowersByDay(read.dates, Date.now(), WINDOW_DAYS, coveredFrom),
    total: read.total,
    reachedCap: read.reachedCap,
    source: 'twitch',
  }
}

async function loadVideos(broadcasterId: string): Promise<VideoHistory> {
  const videos = await cached(videoCache, broadcasterId, () =>
    getVideos(broadcasterId, VIDEOS_PER_REQUEST, { type: 'archive' }),
  )
  const now = Date.now()
  return {
    views: viewsPerBroadcast(videos, now, WINDOW_DAYS),
    hours: bucketHoursByDay(videos, now, WINDOW_DAYS),
    coverageDays: coverageDays(videos, now),
    source: 'twitch',
  }
}

/**
 * The Twitch-sourced data behind the 30-day charts: follower gains per day and the broadcast
 * recordings. Each section loads and fails on its own, once per mount, and a second mount for the
 * same streamer within 15 minutes makes no request. Pass a null id to make no request.
 */
export function useStreamerHistory(
  broadcasterId: string | null,
  onSessionExpired: () => void,
): { followers: Section<FollowerHistory>; videos: Section<VideoHistory> } {
  const followers = useSection(broadcasterId, loadFollowers, onSessionExpired)
  const videos = useSection(broadcasterId, loadVideos, onSessionExpired)
  return { followers, videos }
}
