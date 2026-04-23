import { useState, useEffect, useMemo, useCallback } from 'react'
import { getFollowedChannels, SessionExpiredError } from '../lib/twitchApi'
import type { TwitchFollowedChannel } from '../types/twitch'

interface TasteProfile {
  totalFollowed: number
  followedChannels: TwitchFollowedChannel[]
  recentFollows: TwitchFollowedChannel[]
}

interface UseTasteProfileOptions {
  handleAuthError?: () => void
}

interface UseTasteProfileReturn {
  profile: TasteProfile | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useTasteProfile(
  userId: string | null,
  isAuthenticated: boolean,
  options?: UseTasteProfileOptions,
): UseTasteProfileReturn {
  const [channels, setChannels] = useState<TwitchFollowedChannel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasFetched, setHasFetched] = useState(false)

  const fetchFollowed = useCallback(async () => {
    if (!userId || !isAuthenticated) return

    setLoading(true)
    setError(null)

    try {
      const data = await getFollowedChannels(userId)
      setChannels(data)
      setHasFetched(true)
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        options?.handleAuthError?.()
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch followed channels')
      }
    } finally {
      setLoading(false)
    }
  }, [userId, isAuthenticated, options])

  useEffect(() => {
    if (!userId || !isAuthenticated) return

    let cancelled = false

    getFollowedChannels(userId).then(
      (data) => {
        if (cancelled) return
        setChannels(data)
        setHasFetched(true)
      },
      (err) => {
        if (cancelled) return
        if (err instanceof SessionExpiredError) {
          options?.handleAuthError?.()
          setError(err.message)
        } else {
          setError(err instanceof Error ? err.message : 'Failed to fetch followed channels')
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [userId, isAuthenticated, options])

  const profile = useMemo<TasteProfile | null>(() => {
    if (!isAuthenticated || !hasFetched) return null

    const sorted = [...channels].sort(
      (a, b) => new Date(b.followed_at).getTime() - new Date(a.followed_at).getTime(),
    )

    return {
      totalFollowed: channels.length,
      followedChannels: channels,
      recentFollows: sorted.slice(0, 10),
    }
  }, [channels, isAuthenticated, hasFetched])

  const refetch = useCallback(() => {
    fetchFollowed()
  }, [fetchFollowed])

  return { profile, loading, error, refetch }
}
