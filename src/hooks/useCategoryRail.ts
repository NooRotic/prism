import { useState, useEffect } from 'react'
import { getStreamsByGameId } from '../lib/twitchApi'
import type { TwitchStream } from '../types/twitch'

/** Ranked slots — the leaderboard head. */
export const RAIL_TOP_COUNT = 3
/** Random slots drawn from everyone below the head. */
export const RAIL_SAMPLE_COUNT = 5
/** How deep to fetch before sampling. */
const POOL_SIZE = 40

/**
 * `RAIL_TOP_COUNT + RAIL_SAMPLE_COUNT` deliberately equals the section cap
 * of 8, so the recommendations section is full by construction and never
 * renders a `+N`. Changing either constant should preserve that sum, or the
 * two rules will disagree.
 */

interface UseCategoryRailReturn {
  streams: TwitchStream[]
  loading: boolean
  error: string | null
}

/**
 * Recommendations for the category currently in context.
 *
 * Deliberately not a pure leaderboard. A straight top-8 would surface the
 * same handful of channels forever; the random tail is the point of the
 * feature.
 */
export function useCategoryRail(
  gameId: string | null,
  excludeUserId: string | null,
): UseCategoryRailReturn {
  const [streams, setStreams] = useState<TwitchStream[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing recommendations when the user leaves a category route
      setStreams((prev) => (prev.length === 0 ? prev : []))
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    getStreamsByGameId(gameId, POOL_SIZE)
      .then((pool) => {
        if (cancelled) return

        // Computed once, right here in the effect's success handler, and
        // held in state — not derived during render. `useMemo` is only a
        // performance hint: React explicitly reserves the right to discard
        // a memo cache and recompute it. If that ever happened, the
        // Math.random() below would re-run mid-render and the rail would
        // reshuffle under the user's cursor — precisely the failure this
        // is meant to prevent. Impurity is legal here, in a promise
        // callback, so the random sample is taken once per fetch and
        // frozen into state; no re-render can ever recompute it.
        const eligible = pool
          .filter((s) => s.user_id !== excludeUserId)
          .sort((a, b) => b.viewer_count - a.viewer_count)

        const top = eligible.slice(0, RAIL_TOP_COUNT)
        const remainder = eligible.slice(RAIL_TOP_COUNT)

        // Fisher-Yates on a copy — sampling without replacement, so a channel
        // cannot appear twice.
        const shuffled = [...remainder]
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
        }

        setStreams([...top, ...shuffled.slice(0, RAIL_SAMPLE_COUNT)])
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setStreams([])
        setError(
          err instanceof Error ? err.message : 'Failed to load recommendations',
        )
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [gameId, excludeUserId])

  return { streams, loading, error }
}
