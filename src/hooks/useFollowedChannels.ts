import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  getFollowedChannels,
  getStreamsByUserIds,
  SessionExpiredError,
} from '../lib/twitchApi'
import type { TwitchFollowedChannel, TwitchStream } from '../types/twitch'
import type { FollowingSort } from '../contexts/AppContext'

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
  /** Count of currently-live follows in `data`. */
  liveCount: number
  loading: boolean
  error: string | null
  refetch: () => void
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
 * Sort enriched follows by the user's chosen ordering. Live channels
 * always come before offline when the 'live-first' option is used.
 */
export function sortFollows(
  follows: EnrichedFollow[],
  sort: FollowingSort,
): EnrichedFollow[] {
  const copy = [...follows]
  const byName = (a: EnrichedFollow, b: EnrichedFollow) =>
    a.broadcaster_name.localeCompare(b.broadcaster_name, undefined, {
      sensitivity: 'base',
    })

  switch (sort) {
    case 'alpha':
      return copy.sort(byName)
    case 'viewers':
      return copy.sort((a, b) => {
        // Live streams with higher viewer count first; offline last by name
        if (a.isLive && b.isLive) {
          return (b.viewerCount ?? 0) - (a.viewerCount ?? 0)
        }
        if (a.isLive && !b.isLive) return -1
        if (!a.isLive && b.isLive) return 1
        return byName(a, b)
      })
    case 'live-first':
    default:
      return copy.sort((a, b) => {
        if (a.isLive && !b.isLive) return -1
        if (!a.isLive && b.isLive) return 1
        return byName(a, b)
      })
  }
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
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(
    async (uid: string) => {
      setLoading(true)
      setError(null)
      try {
        const follows = await getFollowedChannels(uid, 100)
        setTotalCount(follows.length)

        const ids = follows.map((f) => f.broadcaster_id)
        const liveStreams =
          ids.length > 0 ? await getStreamsByUserIds(ids) : []

        setRawFollows(enrichFollows(follows, liveStreams))
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

  return {
    data: rawFollows,
    totalCount,
    liveCount,
    loading,
    error,
    refetch,
  }
}
