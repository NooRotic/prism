import { useEffect } from 'react'
import { useApp } from '../contexts/AppContext'
import { getAuthenticatedUser, SessionExpiredError } from '../lib/twitchApi'
import { useSessionExpiry } from './useSessionExpiry'

/**
 * Loads the signed-in user's own profile once after login. A failure that is not
 * an expired session is recorded in the auth state (`profileError`) and is not
 * retried until something dispatches `LOGIN_USER_RETRY`, so a broken endpoint
 * cannot make the page request in a loop. An expired session signs the viewer
 * out as expired: this is the first request after a reload with a stale token, so
 * it is the expiry a returning viewer meets first.
 */
export function useAuthProfile(): void {
  const { state, dispatch } = useApp()
  const onSessionExpired = useSessionExpiry()
  const { isAuthenticated } = state.auth
  const loaded = state.auth.user !== null
  const failed = state.auth.profileError

  useEffect(() => {
    if (!isAuthenticated || loaded || failed) return
    let cancelled = false
    getAuthenticatedUser()
      .then((user) => {
        if (!cancelled) dispatch({ type: 'LOGIN_USER_LOADED', user })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof SessionExpiredError) {
          onSessionExpired()
        } else {
          dispatch({ type: 'LOGIN_USER_FAILED' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, loaded, failed, dispatch, onSessionExpired])
}
