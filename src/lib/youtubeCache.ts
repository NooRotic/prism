import type { YouTubeVideo } from './youtubeApi'

export interface CachedYouTubeResults {
  videos: YouTubeVideo[]
  nextPageToken: string | null
  timestamp: number
  query: string
}

const CACHE_KEY_PREFIX = 'prism_yt_cache_'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

export function getCachedResults(categoryId: string): CachedYouTubeResults | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${categoryId}`)
    if (raw === null) return null
    const data = JSON.parse(raw) as CachedYouTubeResults
    if (Date.now() - data.timestamp >= CACHE_TTL_MS) return null
    return data
  } catch {
    return null
  }
}

export function setCachedResults(categoryId: string, data: CachedYouTubeResults): void {
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${categoryId}`, JSON.stringify(data))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[youtubeCache] localStorage quota exceeded — skipping cache write for', categoryId)
    }
  }
}

export function appendCachedPage(
  categoryId: string,
  newVideos: YouTubeVideo[],
  nextPageToken: string | null,
): void {
  const existing = getCachedResults(categoryId)
  if (existing === null) return
  const updated: CachedYouTubeResults = {
    ...existing,
    videos: [...existing.videos, ...newVideos],
    nextPageToken,
  }
  try {
    localStorage.setItem(`${CACHE_KEY_PREFIX}${categoryId}`, JSON.stringify(updated))
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      console.warn('[youtubeCache] localStorage quota exceeded — skipping cache append for', categoryId)
    }
  }
}

export function invalidateCache(categoryId: string): void {
  localStorage.removeItem(`${CACHE_KEY_PREFIX}${categoryId}`)
}

export function invalidateAllCache(): void {
  const keysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key !== null && key.startsWith(CACHE_KEY_PREFIX)) {
      keysToRemove.push(key)
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key)
  }
}

export function isCacheExpired(categoryId: string): boolean {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY_PREFIX}${categoryId}`)
    if (raw === null) return true
    const data = JSON.parse(raw) as CachedYouTubeResults
    return Date.now() - data.timestamp >= CACHE_TTL_MS
  } catch {
    return true
  }
}
