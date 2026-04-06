import { useState, useEffect, useCallback } from 'react'
import {
  loginWithTwitch,
  handleTwitchRedirect,
  getStoredToken,
  clearToken,
} from '../lib/twitchAuth'
import { SessionExpiredError } from '../lib/twitchApi'
import { useApp } from '../contexts/AppContext'

export function useTwitchAuth() {
  const { dispatch } = useApp()
  const [token, setToken] = useState<string | null>(getStoredToken)
  const [isAuthenticated, setIsAuthenticated] = useState(!!getStoredToken())

  useEffect(() => {
    // Sync initial token state to AppContext
    const stored = getStoredToken()
    if (stored) {
      dispatch({ type: 'LOGIN', token: stored })
    }

    // Check for OAuth redirect on mount
    const redirectToken = handleTwitchRedirect()
    if (redirectToken) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing external OAuth redirect state on mount
      setToken(redirectToken)
      setIsAuthenticated(true)
      dispatch({ type: 'LOGIN', token: redirectToken })
    }
  }, [dispatch])

  const login = useCallback(() => {
    loginWithTwitch()
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setToken(null)
    setIsAuthenticated(false)
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
