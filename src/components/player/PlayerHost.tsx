import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { Settings } from 'lucide-react'
import type { URLDetectionResult, PlayerEngine } from '../../lib/urlDetection'
import { getRecommendedEngine, getURLTypeDisplayName } from '../../lib/urlDetection'
import type { PlayerProps } from '../../types/player'
import { useApp } from '../../contexts/AppContext'
import FallbackCard from './FallbackCard'

// Lazy-load heavy player components
const TwitchEmbedPlayer = lazy(() => import('./TwitchEmbedPlayer'))
const TwitchIframePlayer = lazy(() => import('./TwitchIframePlayer'))
const VideoJSPlayer = lazy(() => import('./VideoJSPlayer'))
const DashJSPlayer = lazy(() => import('./DashJSPlayer'))
const YouTubePlayer = lazy(() => import('./YouTubePlayer'))

interface PlayerHostProps {
  url: string
  detection: URLDetectionResult
}

const PLAYER_LOADING_FALLBACK = (
  <div
    className="flex items-center justify-center w-full h-full"
    style={{ minHeight: 300, backgroundColor: 'var(--bg-card)' }}
  >
    <div
      className="animate-pulse text-sm"
      style={{ color: 'var(--text-muted)' }}
    >
      Loading player...
    </div>
  </div>
)

/** Returns the fallback chain for a given content type */
function getFallbackChain(
  detection: URLDetectionResult,
): PlayerEngine[] {
  switch (detection.type) {
    case 'twitch':
      return ['twitch-sdk', 'twitch-iframe', 'fallback']
    case 'youtube':
      return ['reactplayer', 'fallback']
    case 'hls':
    case 'mp4':
      return ['videojs', 'fallback']
    case 'dash':
      return ['dashjs', 'fallback']
    default:
      return ['fallback']
  }
}

export default function PlayerHost({ url, detection }: PlayerHostProps) {
  const { state, dispatch } = useApp()
  const { debugMode } = state.player

  const chain = getFallbackChain(detection)
  const initialEngine = getRecommendedEngine(detection)

  const [fallbackStep, setFallbackStep] = useState(0)
  const [activeEngine, setActiveEngine] = useState<PlayerEngine>(initialEngine)
  const [errorReason, setErrorReason] = useState<string | null>(null)

  // Reset fallback state when URL or detection changes
  useEffect(() => {
    const engine = getRecommendedEngine(detection)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting state on prop change
    setFallbackStep(0)
    setActiveEngine(engine)
    setErrorReason(null)
    dispatch({ type: 'SET_ENGINE', engine, fallbackStep: 0 })
  }, [url, detection, dispatch])

  const advanceFallback = useCallback(
    (error: string) => {
      const nextStep = fallbackStep + 1
      if (nextStep < chain.length) {
        const nextEngine = chain[nextStep]
        setFallbackStep(nextStep)
        setActiveEngine(nextEngine)
        setErrorReason(error)
        dispatch({
          type: 'SET_ENGINE',
          engine: nextEngine,
          fallbackStep: nextStep,
        })
      } else {
        // All engines exhausted
        setActiveEngine('fallback')
        setErrorReason(error)
        dispatch({
          type: 'SET_ENGINE',
          engine: 'fallback',
          fallbackStep: nextStep,
        })
      }
    },
    [fallbackStep, chain, dispatch],
  )

  const handleReady = useCallback(() => {
    setErrorReason(null)
  }, [])

  const handleError = useCallback(
    (error: string) => {
      advanceFallback(error)
    },
    [advanceFallback],
  )

  const toggleDebug = useCallback(() => {
    dispatch({ type: 'TOGGLE_DEBUG' })
  }, [dispatch])

  // Build shared props for player components
  const playerProps: PlayerProps = {
    url,
    detection,
    onReady: handleReady,
    onError: handleError,
    onPlay: undefined,
    onPause: undefined,
  }

  const renderPlayer = () => {
    switch (activeEngine) {
      case 'twitch-sdk':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <TwitchEmbedPlayer {...playerProps} />
          </Suspense>
        )
      case 'twitch-iframe':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <TwitchIframePlayer {...playerProps} />
          </Suspense>
        )
      case 'videojs':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <VideoJSPlayer {...playerProps} />
          </Suspense>
        )
      case 'dashjs':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <DashJSPlayer {...playerProps} />
          </Suspense>
        )
      case 'reactplayer':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <YouTubePlayer {...playerProps} />
          </Suspense>
        )
      case 'fallback':
      default:
        return <FallbackCard detection={detection} error={errorReason} />
    }
  }

  return (
    <div className="relative w-full h-full">
      {/* Player area */}
      {renderPlayer()}

      {/* Debug toggle button */}
      <button
        onClick={toggleDebug}
        className="absolute bottom-2 right-2 z-20 p-1.5 rounded-md transition-colors duration-150 hover:bg-white/10"
        style={{
          color: debugMode ? 'var(--accent-green)' : 'var(--text-muted)',
        }}
        title="Toggle debug overlay"
        aria-label="Toggle debug overlay"
      >
        <Settings size={16} />
      </button>

      {/* Debug overlay */}
      {debugMode && (
        <div
          className="absolute bottom-10 right-2 z-20 p-3 rounded-lg text-xs space-y-1 max-w-xs"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid var(--border-accent)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Engine: </span>
            <span style={{ color: 'var(--accent-green)' }}>
              {activeEngine}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Fallback: </span>
            <span>
              step {fallbackStep} / {chain.length - 1}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Type: </span>
            <span>{getURLTypeDisplayName(detection)}</span>
          </div>
          {errorReason && (
            <div>
              <span style={{ color: 'var(--accent-red)' }}>Error: </span>
              <span className="break-words">{errorReason}</span>
            </div>
          )}
          <div className="pt-1 border-t border-white/10">
            <span style={{ color: 'var(--text-muted)' }}>Chain: </span>
            <span>
              {chain.map((e, i) => (
                <span
                  key={e}
                  style={{
                    color:
                      i === fallbackStep
                        ? 'var(--accent-green)'
                        : i < fallbackStep
                          ? 'var(--accent-red)'
                          : 'var(--text-muted)',
                  }}
                >
                  {i > 0 && ' > '}
                  {e}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
