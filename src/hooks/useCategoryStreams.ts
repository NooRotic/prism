import { useState, useEffect, useCallback } from 'react'
import {
  getGameByName,
  getStreamsByGameId,
  getFollowedChannelsPage,
  SessionExpiredError,
} from '../lib/twitchApi'
import type { TwitchStream, TwitchGame } from '../types/twitch'
import { useCallbackRefs } from './useCallbackRefs'

/** Enriched stream = raw /streams row + a flag for whether the viewing user follows this broadcaster. */
export interface EnrichedCategoryStream {
  id: string
  user_id: string
  user_login: string
  user_name: string
  game_name: string
  title: string
  viewer_count: number
  thumbnail_url: string
  started_at: string
  /** True when the authenticated user follows this broadcaster. */
  isFollowed: boolean
}

interface UseCategoryStreamsOptions {
  handleAuthError?: () => void
}

interface UseCategoryStreamsReturn {
  game: TwitchGame | null
  streams: EnrichedCategoryStream[]
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Build a Set of broadcaster_ids that the authenticated user follows,
 * pulled from ONE page of /channels/followed. Used to mark streams in
 * a category with an "I follow this channel" badge. 100 follows is
 * the same cap FollowingPanel used pre-pagination and is enough for
 * most users — if the user follows >100 channels and one of them is
 * in the category they're looking at, the badge may miss.
 *
 * (Running the full paginated Following-panel loop here would cost
 * 4+ calls, which is overkill for a badge. Trade-off noted.)
 */
async function loadFollowedSet(viewerUserId: string): Promise<Set<string>> {
  try {
    const page = await getFollowedChannelsPage(viewerUserId, 100)
    return new Set(page.data.map((f) => f.broadcaster_id))
  } catch {
    return new Set()
  }
}

/**
 * Fetch live streams in a Twitch game/category and enrich each row
 * with an isFollowed flag based on the authenticated user's follow
 * list. The hook is a no-op when either `categoryName` or
 * `viewerUserId` is null — use this to gate on panel open state.
 */
export function useCategoryStreams(
  categoryName: string | null,
  viewerUserId: string | null,
  options?: UseCategoryStreamsOptions,
): UseCategoryStreamsReturn {
  const [game, setGame] = useState<TwitchGame | null>(null)
  const [streams, setStreams] = useState<EnrichedCategoryStream[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ref for options so fetchData doesn't need to re-memoize on every
  // render. Uses the shared useCallbackRefs helper.
  const cb = useCallbackRefs({ options })

  const fetchData = useCallback(
    async (name: string, uid: string | null) => {
      setLoading(true)
      setError(null)
      setStreams([])
      setGame(null)
      try {
        // Step 1: resolve name -> game_id
        const foundGame = await getGameByName(name)
        if (!foundGame) {
          setError(`Category "${name}" not found`)
          setLoading(false)
          return
        }
        setGame(foundGame)

        // Step 2: fetch live streams + follow set in parallel. If
        // viewerUserId is null (panel opened while not logged in),
        // follow set is empty and no channel gets badged.
        const [liveStreams, followedIds] = await Promise.all([
          getStreamsByGameId(foundGame.id, 30),
          uid ? loadFollowedSet(uid) : Promise.resolve(new Set<string>()),
        ])

        const enriched: EnrichedCategoryStream[] = liveStreams.map(
          (stream: TwitchStream) => ({
            id: stream.id,
            user_id: stream.user_id,
            user_login: stream.user_login,
            user_name: stream.user_name,
            game_name: stream.game_name,
            title: stream.title,
            viewer_count: stream.viewer_count,
            thumbnail_url: stream.thumbnail_url,
            started_at: stream.started_at,
            isFollowed: followedIds.has(stream.user_id),
          }),
        )

        setStreams(enriched)
        setLoading(false)
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          cb.current.options?.handleAuthError?.()
          setError(err.message)
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load category streams',
          )
        }
        setLoading(false)
      }
    },
    // `cb` has stable identity via useCallbackRefs.
    [cb],
  )

  useEffect(() => {
    if (!categoryName) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on panel close
      setGame(null)
      setStreams([])
      setError(null)
      return
    }
    fetchData(categoryName, viewerUserId)
  }, [categoryName, viewerUserId, fetchData])

  const refetch = useCallback(() => {
    if (categoryName) fetchData(categoryName, viewerUserId)
  }, [categoryName, viewerUserId, fetchData])

  return { game, streams, loading, error, refetch }
}
