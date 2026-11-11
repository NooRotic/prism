import { useCallback } from 'react'
import { useApp } from '../contexts/AppContext'
import { clearToken } from '../lib/twitchAuth'

/**
 * A callback that signs the viewer out because their Twitch session expired:
 * it clears the stored token and marks the session expired, so the signed-out
 * page can tell them to connect again. `twitchApiFetch` already drops the token
 * on a 401, but nothing told the app, so it kept acting signed in.
 */
export function useSessionExpiry(): () => void {
  const { dispatch } = useApp()
  return useCallback(() => {
    clearToken()
    dispatch({ type: 'TOKEN_EXPIRED' })
  }, [dispatch])
}
