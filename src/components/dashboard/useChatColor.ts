import { useEffect, useRef, useState } from 'react'
import { getChatColor, SessionExpiredError } from '../../lib/twitchApi'

interface Loaded {
  userId: string
  color: string | null
}

/**
 * The viewer's Twitch chat name colour, fetched once per user id. The colour is
 * cosmetic, so any failure just leaves it null; only an expired session is
 * reported, because that one means the viewer has to sign in again.
 */
export function useChatColor(userId: string | null, onSessionExpired: () => void): string | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  // Read the latest callback from a ref so a new function each render does not refetch.
  const expiredRef = useRef(onSessionExpired)
  useEffect(() => {
    expiredRef.current = onSessionExpired
  })

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getChatColor(userId)
      .then((color) => {
        if (!cancelled) setLoaded({ userId, color })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof SessionExpiredError) expiredRef.current()
        setLoaded({ userId, color: null })
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  return loaded && loaded.userId === userId ? loaded.color : null
}
