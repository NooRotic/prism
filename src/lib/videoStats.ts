/**
 * View counts and publish dates for a list of videos, so a search result can be sorted by them. ONE videos.list call
 * (1 quota unit) for up to 50 videos, instead of re-running a 100-unit search with another `order`. Each video's stats are
 * cached for 6 hours. Never throws: on any failure the list comes back as it was.
 */
import { STORAGE_KEYS } from '../config/storageKeys'
import { ttlGet, ttlSet } from './ttlCache'
import { youtubeGet } from './videoPageApi'
import type { YouTubeVideo } from './youtubeApi'

const prefix = STORAGE_KEYS.LOCAL_VIDEO_PAGE_CACHE_PREFIX
const STATS_TTL_MS = 6 * 60 * 60 * 1000

interface Stats {
  viewCount?: string
  publishedAt: string
}

const complete = (v: YouTubeVideo) => v.viewCount !== undefined && v.publishedAt !== ''

export async function withStats(videos: YouTubeVideo[]): Promise<YouTubeVideo[]> {
  const known = new Map<string, Stats>()
  const missing: string[] = []
  for (const v of videos) {
    if (complete(v)) continue
    const cached = ttlGet<Stats>(`${prefix}stats_${v.id}`, STATS_TTL_MS)
    if (cached) known.set(v.id, cached)
    else missing.push(v.id)
  }
  const ids = [...new Set(missing)].slice(0, 50)
  if (ids.length > 0) {
    try {
      const data = await youtubeGet('videos', { part: 'snippet,statistics', id: ids.join(',') })
      for (const it of data.items ?? []) {
        const stats: Stats = { viewCount: it.statistics?.viewCount, publishedAt: it.snippet?.publishedAt ?? '' }
        known.set(it.id, stats)
        ttlSet(`${prefix}stats_${it.id}`, stats)
      }
    } catch {
      /* no stats: the list is shown as it is */
    }
  }
  return videos.map((v) => {
    const s = known.get(v.id)
    if (!s) return v
    return { ...v, viewCount: v.viewCount ?? s.viewCount, publishedAt: v.publishedAt || s.publishedAt }
  })
}
