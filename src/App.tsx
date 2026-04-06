import { useCallback, useEffect, useState } from 'react'
import { AppProvider, useApp } from './contexts/AppContext'
import { Header } from './components/layout/Header'
import AppShell from './components/layout/AppShell'
import { useChannelData } from './hooks/useChannelData'
import { useTwitchAuth } from './hooks/useTwitchAuth'
import { detectURLType } from './lib/urlDetection'

function AppInner() {
  const { state, dispatch } = useApp()
  const { handleAuthError, isAuthenticated } = useTwitchAuth()
  const [channelToLoad, setChannelToLoad] = useState<string | null>(null)
  const [lastUrl, setLastUrl] = useState('')

  const authErrorHandler = useCallback(
    () => handleAuthError(null),
    [handleAuthError],
  )

  // Derive channel name from player URL changes
  useEffect(() => {
    const { detection, currentUrl } = state.player
    if (!currentUrl || currentUrl === lastUrl) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- deriving state from prop change
    setLastUrl(currentUrl)

    if (detection?.type === 'twitch' && detection.metadata?.channelName) {
      setChannelToLoad(detection.metadata.channelName)
    } else if (
      detection?.type === 'unknown' &&
      !currentUrl.includes('.') &&
      !currentUrl.includes('/') &&
      !currentUrl.includes(':')
    ) {
      // Plain channel name — upgrade to Twitch URL
      setChannelToLoad(currentUrl)
      const twitchDetection = detectURLType(`https://twitch.tv/${currentUrl}`)
      dispatch({ type: 'PLAY_URL', url: `https://twitch.tv/${currentUrl}`, detection: twitchDetection })
    }
  }, [state.player.currentUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only fetch channel data when authenticated (Helix API requires token)
  const channelForApi = isAuthenticated ? channelToLoad : null
  useChannelData(channelForApi, { handleAuthError: authErrorHandler })

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <Header />
      <AppShell />
    </div>
  )
}

function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  )
}

export default App
