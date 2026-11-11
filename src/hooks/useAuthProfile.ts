import { useEffect } from 'react'
import { useApp } from '../contexts/AppContext'
import { getAuthenticatedUser, SessionExpiredError } from '../lib/twitchApi'
import { useTwitchAuth } from './useTwitchAuth'

/**
 * Loads the signed-in user's own profile once after login. A failure that is not
 * an expired session is recorded in the auth state (`profileError`) and is not
 * retried until something dispatches `LOGIN_USER_RETRY`, so a broken endpoint
 * cannot make the page request in a loop.
 */
export function useAuthProfile(): void {
  const { state, dispatch } = useApp()
  const { isAuthenticated, handleAuthError } = useTwitchAuth()
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
          handleAuthError(err)
        } else {
          dispatch({ type: 'LOGIN_USER_FAILED' })
        }
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, loaded, failed, dispatch, handleAuthError])
}
