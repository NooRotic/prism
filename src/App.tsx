import { useEffect, useState } from 'react'
import { AppProvider, useApp } from './contexts/AppContext'
import { Header } from './components/layout/Header'
import AppShell from './components/layout/AppShell'
import { useChannelData } from './hooks/useChannelData'
import { useTwitchAuth } from './hooks/useTwitchAuth'
import { detectURLType } from './lib/urlDetection'

function AppInner() {
  const { state, dispatch } = useApp()
  const { handleAuthError } = useTwitchAuth()
  const [channelToLoad, setChannelToLoad] = useState<string | null>(null)

  // When a Twitch channel URL is played, extract channel name and load data
  useEffect(() => {
    const { detection } = state.player
    if (!detection) return

    if (detection.type === 'twitch' && detection.metadata?.channelName) {
      setChannelToLoad(detection.metadata.channelName)
    }
  }, [state.player.detection])

  // Also handle plain text channel name submissions (from SmartUrlInput)
  useEffect(() => {
    const url = state.player.currentUrl
    if (!url) return

    // If the URL doesn't look like a URL, it's a plain channel name
    if (!url.includes('.') && !url.includes('/') && !url.includes(':')) {
      setChannelToLoad(url)
      // Also set up the detection for the player
      const detection = detectURLType(`https://twitch.tv/${url}`)
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [state.player.currentUrl, dispatch])

  useChannelData(channelToLoad, { handleAuthError: () => handleAuthError(null) })

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
