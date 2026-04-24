import { useState, useEffect, useCallback } from 'react'
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
import { useCallbackRefs } from './useCallbackRefs'
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
  cursor: string | null
  loadingMore: boolean
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
  return { data: null, loading: false, error: null, cursor: null, loadingMore: false }
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
  loadMoreSubs: () => Promise<void>
  loadMoreVIPs: () => Promise<void>
  loadMorePolls: () => Promise<void>
  loadMorePredictions: () => Promise<void>
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
  cursor: string | null = null,
): Promise<SectionState<T>> {
  try {
    const data = await fetcher()
    return { data, loading: false, error: null, cursor, loadingMore: false }
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      onSessionExpired()
      return { data: null, loading: false, error: err.message, cursor: null, loadingMore: false }
    }
    return {
      data: null,
      loading: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load section',
      cursor: null,
      loadingMore: false,
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

  // Hold options in a ref via the shared useCallbackRefs helper so
  // fetchAll doesn't need to re-memoize whenever the caller passes a
  // fresh options object. Without this, a new literal every render
  // would rebuild fetchAll → re-fire the effect → loop forever.
  const cb = useCallbackRefs({ options })

  const fetchAll = useCallback(
    async (id: string) => {
      const authError = () => cb.current.options?.handleAuthError?.()

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
        // Subscribers — inline async block to capture pagination cursor
        promises.push(
          (async () => {
            try {
              const response = await getBroadcasterSubscriptions(id, 100)
              const cursor = response.pagination?.cursor ?? null
              setStats((prev) => ({
                ...prev,
                subscribers: {
                  data: {
                    total: response.total,
                    points: response.points,
                    recent: response.data.slice(0, 5),
                  },
                  loading: false,
                  error: null,
                  cursor,
                  loadingMore: false,
                },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) {
                authError()
                setStats((prev) => ({
                  ...prev,
                  subscribers: { data: null, loading: false, error: err.message, cursor: null, loadingMore: false },
                }))
              } else {
                setStats((prev) => ({
                  ...prev,
                  subscribers: {
                    data: null,
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to load section',
                    cursor: null,
                    loadingMore: false,
                  },
                }))
              }
            }
          })(),
        )

        promises.push(
          runSection(() => getBroadcasterGoals(id), authError).then(
            (section) => setStats((prev) => ({ ...prev, goals: section })),
          ),
        )

        // VIPs — inline async block to capture pagination cursor
        promises.push(
          (async () => {
            try {
              const response = await getBroadcasterVIPs(id, 100)
              setStats((prev) => ({
                ...prev,
                vips: { data: response.data, loading: false, error: null, cursor: response.cursor, loadingMore: false },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) {
                authError()
                setStats((prev) => ({
                  ...prev,
                  vips: { data: null, loading: false, error: err.message, cursor: null, loadingMore: false },
                }))
              } else {
                setStats((prev) => ({
                  ...prev,
                  vips: {
                    data: null,
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to load section',
                    cursor: null,
                    loadingMore: false,
                  },
                }))
              }
            }
          })(),
        )

        promises.push(
          runSection(() => getHypeTrainEvents(id, 5), authError).then(
            (section) =>
              setStats((prev) => ({ ...prev, hypeTrains: section })),
          ),
        )

        // Polls — inline async block to capture pagination cursor
        promises.push(
          (async () => {
            try {
              const response = await getBroadcasterPolls(id, 5)
              setStats((prev) => ({
                ...prev,
                polls: { data: response.data, loading: false, error: null, cursor: response.cursor, loadingMore: false },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) {
                authError()
                setStats((prev) => ({
                  ...prev,
                  polls: { data: null, loading: false, error: err.message, cursor: null, loadingMore: false },
                }))
              } else {
                setStats((prev) => ({
                  ...prev,
                  polls: {
                    data: null,
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to load section',
                    cursor: null,
                    loadingMore: false,
                  },
                }))
              }
            }
          })(),
        )

        // Predictions — inline async block to capture pagination cursor
        promises.push(
          (async () => {
            try {
              const response = await getBroadcasterPredictions(id, 5)
              setStats((prev) => ({
                ...prev,
                predictions: { data: response.data, loading: false, error: null, cursor: response.cursor, loadingMore: false },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) {
                authError()
                setStats((prev) => ({
                  ...prev,
                  predictions: { data: null, loading: false, error: err.message, cursor: null, loadingMore: false },
                }))
              } else {
                setStats((prev) => ({
                  ...prev,
                  predictions: {
                    data: null,
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to load section',
                    cursor: null,
                    loadingMore: false,
                  },
                }))
              }
            }
          })(),
        )

        promises.push(
          runSection(() => getBitsLeaderboard(10), authError).then((section) =>
            setStats((prev) => ({ ...prev, bits: section })),
          ),
        )
      }

      await Promise.all(promises)
    },
    // `cb` is a stable ref object from useCallbackRefs — including
    // it satisfies exhaustive-deps without triggering rebuilds.
    [isStreamer, cb],
  )

  const loadMoreSubs = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.subscribers.cursor
    if (!currentCursor) return
    setStats((prev) => ({ ...prev, subscribers: { ...prev.subscribers, loadingMore: true } }))
    try {
      const response = await getBroadcasterSubscriptions(broadcasterId, 100, currentCursor)
      setStats((prev) => ({
        ...prev,
        subscribers: {
          ...prev.subscribers,
          data: prev.subscribers.data
            ? {
                ...prev.subscribers.data,
                recent: [...prev.subscribers.data.recent, ...response.data],
              }
            : { total: response.total, points: response.points, recent: response.data },
          cursor: response.pagination?.cursor ?? null,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({ ...prev, subscribers: { ...prev.subscribers, loadingMore: false } }))
    }
  }, [broadcasterId, stats.subscribers.cursor])

  const loadMoreVIPs = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.vips.cursor
    if (!currentCursor) return
    setStats((prev) => ({ ...prev, vips: { ...prev.vips, loadingMore: true } }))
    try {
      const response = await getBroadcasterVIPs(broadcasterId, 100, currentCursor)
      setStats((prev) => ({
        ...prev,
        vips: {
          ...prev.vips,
          data: prev.vips.data ? [...prev.vips.data, ...response.data] : response.data,
          cursor: response.cursor ?? null,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({ ...prev, vips: { ...prev.vips, loadingMore: false } }))
    }
  }, [broadcasterId, stats.vips.cursor])

  const loadMorePolls = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.polls.cursor
    if (!currentCursor) return
    setStats((prev) => ({ ...prev, polls: { ...prev.polls, loadingMore: true } }))
    try {
      const response = await getBroadcasterPolls(broadcasterId, 5, currentCursor)
      setStats((prev) => ({
        ...prev,
        polls: {
          ...prev.polls,
          data: prev.polls.data ? [...prev.polls.data, ...response.data] : response.data,
          cursor: response.cursor ?? null,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({ ...prev, polls: { ...prev.polls, loadingMore: false } }))
    }
  }, [broadcasterId, stats.polls.cursor])

  const loadMorePredictions = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.predictions.cursor
    if (!currentCursor) return
    setStats((prev) => ({ ...prev, predictions: { ...prev.predictions, loadingMore: true } }))
    try {
      const response = await getBroadcasterPredictions(broadcasterId, 5, currentCursor)
      setStats((prev) => ({
        ...prev,
        predictions: {
          ...prev.predictions,
          data: prev.predictions.data ? [...prev.predictions.data, ...response.data] : response.data,
          cursor: response.cursor ?? null,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({ ...prev, predictions: { ...prev.predictions, loadingMore: false } }))
    }
  }, [broadcasterId, stats.predictions.cursor])

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

  return { stats, loading, sessionError, refetch, loadMoreSubs, loadMoreVIPs, loadMorePolls, loadMorePredictions }
}
