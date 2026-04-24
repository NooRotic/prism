import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getFollowedChannelsPage,
  getStreamsByUserIds,
  SessionExpiredError,
} from '../lib/twitchApi'
import type { TwitchFollowedChannel, TwitchStream } from '../types/twitch'
import type { FollowingSort } from '../contexts/AppContext'

/**
 * Number of pages to fetch on initial load. 4 pages × 100 per page = 400
 * follows — same as before, but now we keep the cursor for load-more.
 */
const INITIAL_PAGES = 4
const PAGE_SIZE = 100

/**
 * Enriched follow = the raw `/channels/followed` row joined with the
 * live-state subset from `/streams`. Channels that are offline carry
 * `isLive: false` and their stream-only fields are undefined.
 */
export interface EnrichedFollow {
  broadcaster_id: string
  broadcaster_login: string
  broadcaster_name: string
  followed_at: string
  isLive: boolean
  viewerCount?: number
  gameName?: string
  streamTitle?: string
  thumbnailUrl?: string
  startedAt?: string
}

interface UseFollowedChannelsOptions {
  /** Called with the error when a session-expired response is received. */
  handleAuthError?: () => void
}

interface UseFollowedChannelsReturn {
  data: EnrichedFollow[]
  /** Total raw follow count from the API `total` field (not the enriched length). */
  totalCount: number
  /** Number of follows currently loaded in `data` (may be less than totalCount). */
  loadedCount: number
  /** Count of currently-live follows in `data`. */
  liveCount: number
  loading: boolean
  loadingMore: boolean
  error: string | null
  cursor: string | null
  refetch: () => void
  loadMore: () => Promise<void>
}

function enrichFollows(
  follows: TwitchFollowedChannel[],
  liveStreams: TwitchStream[],
): EnrichedFollow[] {
  const streamByUserId = new Map<string, TwitchStream>()
  for (const stream of liveStreams) {
    streamByUserId.set(stream.user_id, stream)
  }
  return follows.map((f) => {
    const stream = streamByUserId.get(f.broadcaster_id)
    if (!stream) {
      return {
        broadcaster_id: f.broadcaster_id,
        broadcaster_login: f.broadcaster_login,
        broadcaster_name: f.broadcaster_name,
        followed_at: f.followed_at,
        isLive: false,
      }
    }
    return {
      broadcaster_id: f.broadcaster_id,
      broadcaster_login: f.broadcaster_login,
      broadcaster_name: f.broadcaster_name,
      followed_at: f.followed_at,
      isLive: true,
      viewerCount: stream.viewer_count,
      gameName: stream.game_name,
      streamTitle: stream.title,
      thumbnailUrl: stream.thumbnail_url,
      startedAt: stream.started_at,
    }
  })
}

/**
 * Sort enriched follows by the user's chosen ordering. All sort modes
 * partition live channels above offline, then sort within each group.
 */
export function sortFollows(
  follows: EnrichedFollow[],
  sort: FollowingSort,
): EnrichedFollow[] {
  const copy = [...follows]
  const dir = sort.dir === 'asc' ? 1 : -1

  const byName = (a: EnrichedFollow, b: EnrichedFollow) =>
    a.broadcaster_name.localeCompare(b.broadcaster_name, undefined, {
      sensitivity: 'base',
    })

  // Partition: live always above offline
  const partition = (a: EnrichedFollow, b: EnrichedFollow): number | null => {
    if (a.isLive && !b.isLive) return -1
    if (!a.isLive && b.isLive) return 1
    return null
  }

  return copy.sort((a, b) => {
    const p = partition(a, b)
    if (p !== null) return p

    switch (sort.mode) {
      case 'alpha':
        return dir * byName(a, b)
      case 'viewers': {
        const bothLive = a.isLive && b.isLive
        if (bothLive) {
          return dir * ((a.viewerCount ?? 0) - (b.viewerCount ?? 0))
        }
        return dir * byName(a, b)
      }
      case 'live-first':
      default: {
        const bothLive = a.isLive && b.isLive
        if (bothLive) {
          return dir * ((a.viewerCount ?? 0) - (b.viewerCount ?? 0))
        }
        return byName(a, b)
      }
    }
  })
}

/**
 * Fetch the authenticated user's followed channels and enrich each row
 * with live-state data from /streams. The caller passes `userId` (the
 * logged-in user's broadcaster ID). When userId is null the hook is a
 * no-op — useful for gating on auth state.
 */
export function useFollowedChannels(
  userId: string | null,
  options?: UseFollowedChannelsOptions,
): UseFollowedChannelsReturn {
  const [rawFollows, setRawFollows] = useState<EnrichedFollow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)

  const fetchData = useCallback(
    async (uid: string) => {
      setLoading(true)
      setError(null)
      try {
        // Paginate through follows for INITIAL_PAGES pages (up to 400 follows).
        // We keep the cursor so the user can load more later.
        const allFollows: TwitchFollowedChannel[] = []
        let pageCursor: string | null = null
        let pages = 0
        do {
          const page = await getFollowedChannelsPage(
            uid,
            PAGE_SIZE,
            pageCursor ?? undefined,
          )
          allFollows.push(...page.data)
          pageCursor = page.cursor
          pages++
        } while (pageCursor && pages < INITIAL_PAGES)

        setCursor(pageCursor)
        setTotalCount(allFollows.length)

        // Live-state enrichment is also batched — up to 100 user_ids
        // per /streams call, so chunk the ids and fire in parallel.
        const liveStreams: TwitchStream[] = []
        if (allFollows.length > 0) {
          const chunks: string[][] = []
          for (let i = 0; i < allFollows.length; i += PAGE_SIZE) {
            chunks.push(
              allFollows
                .slice(i, i + PAGE_SIZE)
                .map((f) => f.broadcaster_id),
            )
          }
          const chunkResults = await Promise.all(
            chunks.map((ids) => getStreamsByUserIds(ids)),
          )
          for (const streams of chunkResults) {
            liveStreams.push(...streams)
          }
        }

        setRawFollows(enrichFollows(allFollows, liveStreams))
        setLoading(false)
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          options?.handleAuthError?.()
          setError(err.message)
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load followed channels',
          )
        }
        setLoading(false)
      }
    },
    [options],
  )

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing state on userId transition to null (logout / panel close)
      setRawFollows([])
      setTotalCount(0)
      setCursor(null)
      return
    }
    fetchData(userId)
  }, [userId, fetchData])

  const liveCount = useMemo(
    () => rawFollows.filter((f) => f.isLive).length,
    [rawFollows],
  )

  const refetch = useCallback(() => {
    if (userId) fetchData(userId)
  }, [userId, fetchData])

  const loadMore = useCallback(async () => {
    if (!userId || !cursor) return
    setLoadingMore(true)
    try {
      const page = await getFollowedChannelsPage(userId, PAGE_SIZE, cursor)
      setCursor(page.cursor)

      const newIds = page.data.map((f) => f.broadcaster_id)
      const newStreams = newIds.length > 0 ? await getStreamsByUserIds(newIds) : []
      const enriched = enrichFollows(page.data, newStreams)

      setRawFollows((prev) => [...prev, ...enriched])
      setTotalCount((prev) => prev + page.data.length)
      setLoadingMore(false)
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        options?.handleAuthError?.()
      }
      setLoadingMore(false)
    }
  }, [userId, cursor, options])

  return {
    data: rawFollows,
    totalCount,
    loadedCount: rawFollows.length,
    liveCount,
    loading,
    loadingMore,
    error,
    cursor,
    refetch,
    loadMore,
  }
}
