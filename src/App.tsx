import { useCallback, useEffect, useState } from 'react'
import { AppProvider, useApp } from './contexts/AppContext'
import { Header } from './components/layout/Header'
import AppShell from './components/layout/AppShell'
import ShaderBackground from './components/ui/ShaderBackground'
import { ChannelIntro } from './components/intro/ChannelIntro'
import { RemixButton } from './components/intro/RemixButton'
import { useChannelData } from './hooks/useChannelData'
import { useTwitchAuth } from './hooks/useTwitchAuth'
import { useIntroState } from './hooks/useIntroState'
import { detectURLType } from './lib/urlDetection'

function AppInner() {
  const { state, dispatch } = useApp()
  const { handleAuthError, isAuthenticated } = useTwitchAuth()
  const [channelToLoad, setChannelToLoad] = useState<string | null>(null)
  const [lastUrl, setLastUrl] = useState('')

  const channelLogin = state.channel.profile?.login ?? null
  const intro = useIntroState(channelLogin)

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
      setChannelToLoad(currentUrl)
      const twitchDetection = detectURLType(`https://twitch.tv/${currentUrl}`)
      dispatch({ type: 'PLAY_URL', url: `https://twitch.tv/${currentUrl}`, detection: twitchDetection })
    }
  }, [state.player.currentUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only fetch channel data when authenticated
  const channelForApi = isAuthenticated ? channelToLoad : null
  useChannelData(channelForApi, { handleAuthError: authErrorHandler })

  // Determine if intro should play (channel loaded + first visit or remix triggered)
  const showIntro = intro.showIntro && state.channel.profile !== null && !state.loading

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <ShaderBackground intensity={0.12} speed={0.25} />

      {showIntro && (
        <ChannelIntro
          template={intro.currentTemplate}
          onComplete={intro.completeIntro}
          onSkip={intro.skipIntro}
        />
      )}

      <Header />

      <div className="relative z-10">
        {/* Remix button — show when a channel is loaded and intro is not playing */}
        {state.channel.profile && !showIntro && (
          <div className="absolute top-2 right-6 z-20">
            <RemixButton onRemix={intro.triggerRemix} />
          </div>
        )}

        <AppShell />
      </div>
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
