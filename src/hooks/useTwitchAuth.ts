import { useEffect, useCallback } from 'react'
import { loginWithTwitch, handleTwitchRedirect, clearToken } from '../lib/twitchAuth'
import { SessionExpiredError } from '../lib/twitchApi'
import { useApp } from '../contexts/AppContext'

export function useTwitchAuth() {
  const { state, dispatch } = useApp()

  // Signed-in state lives in AppContext, not in this hook. Many components call
  // useTwitchAuth, and a private copy per caller went stale for all but one of
  // them: the OAuth redirect hash is one-shot, so only the first caller to mount
  // saw the login, and a logout or an expired session reached only its own copy.
  // AppProvider seeds this from the stored token, so a reload starts signed in.
  const { token, isAuthenticated } = state.auth

  useEffect(() => {
    // Check for OAuth redirect on mount. Whichever caller mounts first consumes
    // the hash; the context carries the result to every other caller.
    const redirectToken = handleTwitchRedirect()
    if (redirectToken) {
      dispatch({ type: 'LOGIN', token: redirectToken })
    }
  }, [dispatch])

  const login = useCallback(() => {
    loginWithTwitch()
  }, [])

  const logout = useCallback(() => {
    clearToken()
    dispatch({ type: 'LOGOUT' })
  }, [dispatch])

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof SessionExpiredError) {
        logout()
        return true
      }
      return false
    },
    [logout],
  )

  return {
    token,
    isAuthenticated,
    login,
    logout,
    handleAuthError,
  }
}
