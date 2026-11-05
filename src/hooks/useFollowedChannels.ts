import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  EMPTY_FOLLOWS,
  getFollowsSnapshot,
  getFollowsStore,
  subscribeToFollows,
} from '../lib/followsStore'
import type { EnrichedFollow } from '../lib/followsStore'
import type { FollowingSort } from '../contexts/AppContext'

export type { EnrichedFollow } from '../lib/followsStore'

interface UseFollowedChannelsOptions {
  /** Called when a session-expired response is received. */
  handleAuthError?: () => void
}

interface UseFollowedChannelsReturn {
  data: EnrichedFollow[]
  /** Number of follows loaded so far. */
  totalCount: number
  /** Number of follows currently loaded in `data` (may be less than the user's total). */
  loadedCount: number
  /** Count of currently-live follows in `data`. */
  liveCount: number
  /** True only for a first load that has nothing to show yet, never for a refresh. */
  loading: boolean
  loadingMore: boolean
  error: string | null
  cursor: string | null
  /** Reload the follow list and live state now. */
  refetch: () => void
  /** Re-read who is live, unless that was done in the last few seconds. */
  refreshLive: () => void
  loadMore: () => Promise<void>
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
 * The authenticated user's followed channels, each enriched with live state.
 * The caller passes `userId` (the logged-in user's broadcaster ID); null makes
 * the hook a no-op, which is how callers gate on auth state.
 *
 * Every caller with the same `userId` reads one shared copy (see
 * lib/followsStore), which reloads who is live every minute while the tab is
 * visible. Components should not gate the hook on being open or on screen:
 * the data is shared and already being kept fresh, so a second subscriber
 * costs nothing.
 */
export function useFollowedChannels(
  userId: string | null,
  options?: UseFollowedChannelsOptions,
): UseFollowedChannelsReturn {
  // The handler goes through a ref so a new `options` object each render does
  // not resubscribe, and so callers need not memoize it.
  const authErrorRef = useRef(options?.handleAuthError)
  useEffect(() => {
    authErrorRef.current = options?.handleAuthError
  })

  const subscribe = useCallback(
    (listener: () => void) =>
      userId ? subscribeToFollows(userId, listener, () => authErrorRef.current?.()) : () => {},
    [userId],
  )
  const getSnapshot = useCallback(
    () => (userId ? getFollowsSnapshot(userId) : EMPTY_FOLLOWS),
    [userId],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const liveCount = useMemo(
    () => snapshot.data.filter((f) => f.isLive).length,
    [snapshot.data],
  )

  const refetch = useCallback(() => {
    if (userId) getFollowsStore(userId)?.refetch()
  }, [userId])

  const refreshLive = useCallback(() => {
    if (userId) getFollowsStore(userId)?.refreshIfStale()
  }, [userId])

  const loadMore = useCallback(async () => {
    if (userId) await getFollowsStore(userId)?.loadMore()
  }, [userId])

  return {
    data: snapshot.data,
    totalCount: snapshot.totalCount,
    loadedCount: snapshot.data.length,
    liveCount,
    loading: snapshot.loading,
    loadingMore: snapshot.loadingMore,
    error: snapshot.error,
    cursor: snapshot.cursor,
    refetch,
    refreshLive,
    loadMore,
  }
}
