import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getBroadcasterSubscriptions,
  getBroadcasterGoals,
  getBroadcasterVIPs,
  getBroadcasterFollowerCount,
  getHypeTrainEvents,
  getBroadcasterPolls,
  getBroadcasterPredictions,
  getBitsLeaderboard,
  SessionExpiredError,
} from '../lib/twitchApi'
import type {
  TwitchBroadcasterSubscription,
  TwitchGoal,
  TwitchVIP,
  TwitchHypeTrainEvent,
  TwitchPoll,
  TwitchPrediction,
  TwitchBitsLeader,
} from '../types/twitch'

/**
 * Per-section fetch state. Each streamer stat section owns its own
 * loading/error flags so a 404 on polls doesn't prevent the goals card
 * from rendering, and a missing scope on one endpoint doesn't tank the
 * whole panel.
 */
export interface SectionState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export interface YourStatsData {
  followerCount: SectionState<number>
  subscribers: SectionState<{
    total: number
    points: number
    recent: TwitchBroadcasterSubscription[]
  }>
  goals: SectionState<TwitchGoal[]>
  vips: SectionState<TwitchVIP[]>
  hypeTrains: SectionState<TwitchHypeTrainEvent[]>
  polls: SectionState<TwitchPoll[]>
  predictions: SectionState<TwitchPrediction[]>
  bits: SectionState<TwitchBitsLeader[]>
}

function emptySection<T>(): SectionState<T> {
  return { data: null, loading: false, error: null }
}

function initialData(): YourStatsData {
  return {
    followerCount: emptySection(),
    subscribers: emptySection(),
    goals: emptySection(),
    vips: emptySection(),
    hypeTrains: emptySection(),
    polls: emptySection(),
    predictions: emptySection(),
    bits: emptySection(),
  }
}

interface UseYourStatsOptions {
  handleAuthError?: () => void
}

interface UseYourStatsReturn {
  stats: YourStatsData
  /** True if at least one section is currently loading. */
  loading: boolean
  /** True if ALL sections errored (likely a session-wide issue). */
  sessionError: boolean
  refetch: () => void
}

/**
 * Map a single API call result onto a SectionState. If the call rejects
 * with SessionExpiredError, we bubble that to the caller so it can
 * trigger a logout. Any other error is captured in the section's
 * error field so the rest of the panel keeps working.
 */
async function runSection<T>(
  fetcher: () => Promise<T>,
  onSessionExpired: () => void,
): Promise<SectionState<T>> {
  try {
    const data = await fetcher()
    return { data, loading: false, error: null }
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      onSessionExpired()
      return { data: null, loading: false, error: err.message }
    }
    return {
      data: null,
      loading: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load section',
    }
  }
}

/**
 * Fetch a broadcaster's stats panel data. `broadcasterId` comes from
 * the authenticated user's own profile; `isStreamer` gates the
 * streamer-only sections (subs, goals, VIPs, hype train, polls,
 * predictions, bits) so non-affiliate/partner users don't hit
 * endpoints that will always 400 for them.
 *
 * The hook is a no-op when `broadcasterId` is null — use this to gate
 * on panel open state like the FollowingPanel does.
 */
export function useYourStats(
  broadcasterId: string | null,
  isStreamer: boolean,
  options?: UseYourStatsOptions,
): UseYourStatsReturn {
  const [stats, setStats] = useState<YourStatsData>(() => initialData())

  // Hold options in a ref so fetchAll doesn't need to re-memoize whenever
  // the caller passes a fresh options object (a new literal every render
  // would otherwise rebuild fetchAll → re-fire the effect → loop forever).
  // Reading through the ref means the latest callback value is used
  // without participating in the callback's dependency array.
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const fetchAll = useCallback(
    async (id: string) => {
      const authError = () => optionsRef.current?.handleAuthError?.()

      // Mark everything loading in one sweep so the UI can show all
      // spinners simultaneously. We'll replace each section as its
      // promise resolves.
      setStats(() => {
        const base = initialData()
        base.followerCount.loading = true
        if (isStreamer) {
          base.subscribers.loading = true
          base.goals.loading = true
          base.vips.loading = true
          base.hypeTrains.loading = true
          base.polls.loading = true
          base.predictions.loading = true
          base.bits.loading = true
        }
        return base
      })

      // Kick all requests off in parallel. Promise.allSettled would
      // work too, but runSection already catches errors individually,
      // so Promise.all gets us finer control over which sections land.
      const promises: Array<Promise<void>> = []

      promises.push(
        runSection(() => getBroadcasterFollowerCount(id), authError).then(
          (section) =>
            setStats((prev) => ({ ...prev, followerCount: section })),
        ),
      )

      if (isStreamer) {
        promises.push(
          runSection(
            () => getBroadcasterSubscriptions(id, 100),
            authError,
          ).then((section) =>
            setStats((prev) => ({
              ...prev,
              subscribers:
                section.data === null
                  ? { ...section, data: null }
                  : {
                      data: {
                        total: section.data.total,
                        points: section.data.points,
                        recent: section.data.data.slice(0, 5),
                      },
                      loading: false,
                      error: null,
                    },
            })),
          ),
        )

        promises.push(
          runSection(() => getBroadcasterGoals(id), authError).then(
            (section) => setStats((prev) => ({ ...prev, goals: section })),
          ),
        )

        promises.push(
          runSection(() => getBroadcasterVIPs(id, 100), authError).then(
            (section) => setStats((prev) => ({ ...prev, vips: section })),
          ),
        )

        promises.push(
          runSection(() => getHypeTrainEvents(id, 5), authError).then(
            (section) =>
              setStats((prev) => ({ ...prev, hypeTrains: section })),
          ),
        )

        promises.push(
          runSection(() => getBroadcasterPolls(id, 5), authError).then(
            (section) => setStats((prev) => ({ ...prev, polls: section })),
          ),
        )

        promises.push(
          runSection(() => getBroadcasterPredictions(id, 5), authError).then(
            (section) =>
              setStats((prev) => ({ ...prev, predictions: section })),
          ),
        )

        promises.push(
          runSection(() => getBitsLeaderboard(10), authError).then((section) =>
            setStats((prev) => ({ ...prev, bits: section })),
          ),
        )
      }

      await Promise.all(promises)
    },
    [isStreamer],
  )

  useEffect(() => {
    if (!broadcasterId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing on panel close / logout
      setStats(initialData())
      return
    }
    fetchAll(broadcasterId)
  }, [broadcasterId, fetchAll])

  const refetch = useCallback(() => {
    if (broadcasterId) fetchAll(broadcasterId)
  }, [broadcasterId, fetchAll])

  // Loading = any section still loading
  const loading = Object.values(stats).some(
    (section) => (section as SectionState<unknown>).loading,
  )

  // sessionError = every section that was attempted failed. Used to
  // detect a likely session-wide auth issue (e.g. every endpoint 401s
  // because the token is missing scopes) and surface a re-auth prompt.
  const attemptedSections = Object.values(stats).filter(
    (section) =>
      (section as SectionState<unknown>).error !== null ||
      (section as SectionState<unknown>).data !== null,
  )
  const sessionError =
    attemptedSections.length > 0 &&
    attemptedSections.every(
      (section) => (section as SectionState<unknown>).error !== null,
    )

  return { stats, loading, sessionError, refetch }
}
