import { useEffect, useRef } from 'react'
import { useApp } from '../contexts/AppContext'
import { SessionExpiredError, getStreams } from '../lib/twitchApi'

/** How often the open offline page asks whether the channel went live. */
export const CHANNEL_LIVE_POLL_MS = 60_000

interface UseChannelLiveOptions {
  userId: string | null
  enabled: boolean
  /** Called when Twitch rejects the viewer's token. */
  onSessionExpired: () => void
}

/**
 * While `enabled`, asks Twitch about the channel's live status once a minute, only while the
 * tab is visible, and straight away when the tab becomes visible again. The answer goes into
 * the shared channel state (the profile's LIVE badge and the page layout read it from there).
 * An answer that arrives after the effect was cleaned up (unmount, a different channel,
 * disabled) is dropped. A failed request is ignored and the next tick tries again, except an
 * expired session, which is reported.
 */
export function useChannelLive({ userId, enabled, onSessionExpired }: UseChannelLiveOptions): void {
  const { dispatch } = useApp()
  const expiredRef = useRef(onSessionExpired)
  useEffect(() => {
    expiredRef.current = onSessionExpired
  }, [onSessionExpired])

  useEffect(() => {
    if (!enabled || userId === null) return
    let cancelled = false

    const check = () => {
      if (document.visibilityState !== 'visible') return
      getStreams(userId).then(
        (stream) => {
          if (!cancelled) dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream })
        },
        (error: unknown) => {
          if (!cancelled && error instanceof SessionExpiredError) expiredRef.current()
        },
      )
    }

    const interval = setInterval(check, CHANNEL_LIVE_POLL_MS)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId, enabled, dispatch])
}
