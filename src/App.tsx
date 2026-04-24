import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { AppProvider, useApp } from './contexts/AppContext'
import { Header } from './components/layout/Header'
import FollowingPanel from './components/layout/FollowingPanel'
import YourStatsPanel from './components/layout/YourStatsPanel'
import CategoryPanel from './components/layout/CategoryPanel'
import ShaderBackground from './components/ui/ShaderBackground'
import { OnboardingIntro } from './components/intro/OnboardingIntro'
import { useTwitchAuth } from './hooks/useTwitchAuth'
import { getAuthenticatedUser, SessionExpiredError } from './lib/twitchApi'

// Pages (lazy-load for code splitting)
import HubPage from './pages/HubPage'
import ProtocolPage from './pages/ProtocolPage'
import TwitchPlayerPage from './pages/TwitchPlayerPage'
import YoutubePlayerPage from './pages/YoutubePlayerPage'
import HlsDashPlayerPage from './pages/HlsDashPlayerPage'

const ONBOARDING_SEEN_KEY = 'prism_onboarding_seen'

function migrateLocalStorageKeys() {
  if (localStorage.getItem('prism_migrated')) return
  const keys: [string, string][] = [
    ['glaze_onboarding_seen', 'prism_onboarding_seen'],
    ['glaze_following_sort', 'prism_following_sort'],
    ['glaze_intros_seen', 'prism_intros_seen'],
    ['glaze_search_history', 'prism_search_history'],
  ]
  for (const [oldKey, newKey] of keys) {
    const value = localStorage.getItem(oldKey)
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value)
      localStorage.removeItem(oldKey)
    }
  }
  localStorage.setItem('prism_migrated', '1')
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

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <ShaderBackground intensity={0.12} speed={0.25} />

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

      {/* Route content */}
      <Outlet />
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<HubPage />} />
            <Route path="twitch" element={<ProtocolPage protocol="twitch" />} />
            <Route path="twitch/:channel" element={<TwitchPlayerPage />} />
            <Route path="youtube" element={<ProtocolPage protocol="youtube" />} />
            <Route path="youtube/:videoId" element={<YoutubePlayerPage />} />
            <Route path="hls-dash" element={<ProtocolPage protocol="hls-dash" />} />
            <Route path="hls-dash/:streamId" element={<HlsDashPlayerPage />} />
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}

export default App
