import { useEffect, useState } from 'react'
import { STORAGE_KEYS } from '../config/storageKeys'
import type { CatchupVideo } from '../lib/catchup'
import { describeVideos } from '../lib/catchupApi'
import { fetchMixIds } from '../lib/mixRelated'
import { ttlGet, ttlSet } from '../lib/ttlCache'

const SHOWN = 12
const DAY_MS = 24 * 60 * 60 * 1000

type Related = { videos: CatchupVideo[]; status: 'loading' | 'ready' | 'empty' }

/** Related videos from the video's Mix (no quota) described in one call (1 unit), cached 24 h. */
export function useRelatedVideos(id: string): Related {
  const [answer, setAnswer] = useState<{ id: string; videos: CatchupVideo[] } | null>(null)
  useEffect(() => {
    let cancelled = false
    const cacheKey = `${STORAGE_KEYS.LOCAL_VIDEO_PAGE_CACHE_PREFIX}related_${id}`
    const done = (videos: CatchupVideo[]) => {
      if (!cancelled) setAnswer({ id, videos })
    }
    const cached = ttlGet<CatchupVideo[]>(cacheKey, DAY_MS)
    if (cached) {
      done(cached)
    } else {
      fetchMixIds(id)
        .then((ids) => (ids.length === 0 ? [] : describeVideos(ids.slice(0, SHOWN))))
        .then((videos) => {
          if (videos.length > 0) ttlSet(cacheKey, videos)
          done(videos)
        })
        .catch(() => done([]))
    }
    return () => {
      cancelled = true
    }
  }, [id])
  if (!answer || answer.id !== id) return { videos: [], status: 'loading' }
  return { videos: answer.videos, status: answer.videos.length > 0 ? 'ready' : 'empty' }
}
