import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../contexts/AppContext'
import {
  getUserInfo,
  getChannelInfo,
  getStreams,
  getClips,
  getVideos,
  getChatEmotes,
  getChatBadges,
  getGames,
  SessionExpiredError,
} from '../lib/twitchApi'
import type { TwitchGame } from '../types/twitch'

interface UseChannelDataOptions {
  handleAuthError?: () => void
}

interface UseChannelDataReturn {
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useChannelData(
  channelName: string | null,
  options?: UseChannelDataOptions,
): UseChannelDataReturn {
  const { dispatch } = useApp()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fetchIdRef = useRef(0)

  const fetchData = useCallback(
    async (name: string) => {
      // Cancel any in-flight request
      abortRef.current?.abort()
      abortRef.current = new AbortController()

      const currentFetchId = ++fetchIdRef.current

      setLoading(true)
      setError(null)
      dispatch({ type: 'LOAD_CHANNEL_START' })

      try {
        // Step 1: Get user info first (need userId for subsequent calls)
        const profile = await getUserInfo(name)
        if (currentFetchId !== fetchIdRef.current) return

        const userId = profile.id

        // Step 2: Fetch all channel data in parallel
        const [channelInfo, stream, clips, videos, emotes, badges] = await Promise.all([
          getChannelInfo(userId),
          getStreams(userId),
          getClips(userId, 100),
          getVideos(userId, 50),
          getChatEmotes(userId),
          getChatBadges(userId),
        ])

        if (currentFetchId !== fetchIdRef.current) return

        // Step 3: Cross-reference clip game_ids via batch getGames
        const uniqueGameIds = [...new Set(clips.map((c) => c.game_id).filter(Boolean))]
        const gamesList = await getGames(uniqueGameIds)

        if (currentFetchId !== fetchIdRef.current) return

        const games = new Map<string, TwitchGame>()
        for (const game of gamesList) {
          games.set(game.id, game)
        }

        dispatch({
          type: 'LOAD_CHANNEL_SUCCESS',
          payload: {
            profile,
            channelInfo,
            stream,
            clips,
            videos,
            emotes,
            badges,
            games,
          },
        })

        setLoading(false)
        setError(null)
      } catch (err) {
        if (currentFetchId !== fetchIdRef.current) return

        if (err instanceof SessionExpiredError) {
          dispatch({ type: 'TOKEN_EXPIRED' })
          options?.handleAuthError?.()
          setError(err.message)
        } else {
          const message = err instanceof Error ? err.message : 'Failed to load channel data'
          setError(message)
          dispatch({ type: 'LOAD_CHANNEL_ERROR', error: message })
        }

        setLoading(false)
      }
    },
    [dispatch, options],
  )

  const refetch = useCallback(() => {
    if (channelName) {
      fetchData(channelName)
    }
  }, [channelName, fetchData])

  useEffect(() => {
    if (!channelName) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching sets state asynchronously via callbacks
    fetchData(channelName)

    return () => {
      abortRef.current?.abort()
    }
  }, [channelName, fetchData])

  return { loading, error, refetch }
}
