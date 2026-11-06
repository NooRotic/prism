import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Outlet, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import { Header } from './components/layout/Header'
import FollowingPanel from './components/layout/FollowingPanel'
import YourStatsPanel from './components/layout/YourStatsPanel'
import CategoryPanel from './components/layout/CategoryPanel'
import ChannelRail from './components/rail/ChannelRail'
import RailGutter from './components/rail/RailGutter'
import FloatingVideoProvider from './components/chat/FloatingVideoProvider'
import MatrixRainBackground from './components/ui/MatrixRainBackground'
import { OnboardingIntro } from './components/intro/OnboardingIntro'
import { useTwitchAuth } from './hooks/useTwitchAuth'
import { getAuthenticatedUser, SessionExpiredError } from './lib/twitchApi'
import { STORAGE_KEYS } from './config/storageKeys'

import AppRoutes from './AppRoutes'

const ONBOARDING_SEEN_KEY = STORAGE_KEYS.LOCAL_ONBOARDING_SEEN

// Frozen historical key names for the one-time `glaze_*` → `prism_*`
// migration. Do NOT centralize these — they are deliberately raw.
function migrateLocalStorageKeys() {
  if (localStorage.getItem(STORAGE_KEYS.LOCAL_MIGRATED)) return
  const keys: [string, string][] = [
    ['glaze_onboarding_seen', STORAGE_KEYS.LOCAL_ONBOARDING_SEEN],
    ['glaze_following_sort', STORAGE_KEYS.LOCAL_FOLLOWING_SORT],
    ['glaze_intros_seen', STORAGE_KEYS.LOCAL_INTROS_SEEN],
    ['glaze_search_history', STORAGE_KEYS.LOCAL_SEARCH_HISTORY],
  ]
  for (const [oldKey, newKey] of keys) {
    const value = localStorage.getItem(oldKey)
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value)
      localStorage.removeItem(oldKey)
    }
  }
  localStorage.setItem(STORAGE_KEYS.LOCAL_MIGRATED, '1')
}

migrateLocalStorageKeys()

/** Shared layout wrapper — Header + slide-down panels + child route via Outlet */
function AppLayout() {
  const { state, dispatch } = useApp()
  const { handleAuthError, isAuthenticated, login } = useTwitchAuth()
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(ONBOARDING_SEEN_KEY)
  })

  // Fetch the authenticated user's own profile once after login
  const authUserLoaded = state.auth.user !== null
  useEffect(() => {
    if (!isAuthenticated || authUserLoaded) return
    let cancelled = false
    getAuthenticatedUser()
      .then((user) => {
        if (!cancelled) dispatch({ type: 'LOGIN_USER_LOADED', user })
      })
      .catch((err) => {
        if (err instanceof SessionExpiredError) {
          handleAuthError(err)
        }
      })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, authUserLoaded, dispatch, handleAuthError])

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    setShowOnboarding(false)
  }, [])

  const handleOnboardingConnect = useCallback(() => {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
    setShowOnboarding(false)
    login()
  }, [login])

  // Per-page matrix rain tuning (Section 3 of design spec)
  const location = useLocation()
  const isPlayerPage = /^\/(twitch|youtube|hls-dash)\//.test(location.pathname)
  const isProtocolPage = ['/twitch', '/youtube', '/hls-dash'].includes(location.pathname)
  const rainOpacity = isPlayerPage ? 0.03 : isProtocolPage ? 0.08 : 0.07
  const rainSpeed = isPlayerPage ? 0.5 : 1

  return (
    <FloatingVideoProvider>
      <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
        {/* Frozen on player pages: an animating full-viewport canvas stops
            Twitch's embed from autoplaying (verified in Chrome 2026-11-03). */}
        <MatrixRainBackground opacity={rainOpacity} speed={rainSpeed} paused={isPlayerPage} />

        {showOnboarding && !isAuthenticated && (
          <OnboardingIntro
            onComplete={handleOnboardingComplete}
            onSkip={handleOnboardingComplete}
            onConnectTwitch={handleOnboardingConnect}
          />
        )}

        <Header />

        {/* Slide-down panels — position:fixed below header at z-30 */}
        <FollowingPanel />
        <YourStatsPanel />
        <CategoryPanel />

        {/* Channel rail — fixed overlay at z-25, above the player, below the
            panels its +N control opens. Mounted here rather than on the Twitch
            player page so follows are reachable on every route. */}
        <ChannelRail />

        {/* Route content. On player pages the rail's collapsed strip is
            reserved, so it never sits over the embed; on the protocol listing
            pages it is reserved too, as their nav sidebar sits flush against the
            left edge and the rail would hide the front of every label (see
            RailGutter). */}
        <RailGutter active={isPlayerPage || isProtocolPage}>
          <Outlet />
        </RailGutter>
      </div>
    </FloatingVideoProvider>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes layout={<AppLayout />} />
      </AppProvider>
    </BrowserRouter>
  )
}

export default App
