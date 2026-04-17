import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  lazy,
  Suspense,
  Component,
} from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { Settings, WifiOff } from 'lucide-react'
import type { URLDetectionResult, PlayerEngine } from '../../lib/urlDetection'
import {
  getRecommendedEngine,
  getURLTypeDisplayName,
} from '../../lib/urlDetection'
import type { PlayerProps } from '../../types/player'
import { useApp } from '../../contexts/AppContext'
import FallbackCard from './FallbackCard'

// Error boundary catches DOM reconciliation crashes from video.js
// (removeChild errors during engine switches) and shows FallbackCard
// instead of a white screen.
class PlayerErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(_: Error, info: ErrorInfo) {
    console.warn('[PlayerErrorBoundary] caught:', info.componentStack)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

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
    id="suspense-loading"
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

function getFallbackChain(detection: URLDetectionResult): PlayerEngine[] {
  switch (detection.type) {
    case 'twitch':
      return detection.platform === 'twitch-clip'
        ? ['twitch-iframe', 'fallback']
        : ['twitch-sdk', 'twitch-iframe', 'fallback']
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

function getContentId(detection: URLDetectionResult): string | null {
  return (
    detection.metadata?.clipId ??
    detection.metadata?.videoId ??
    detection.metadata?.channelName ??
    null
  )
}

export default function PlayerHost({ url, detection }: PlayerHostProps) {
  const { state, dispatch } = useApp()
  const { debugMode } = state.player

  // Memoize chain so its reference stays stable across renders that don't
  // change the detection. This is load-bearing for preventing the Twitch
  // embed from being torn down and rebuilt on every unrelated state change:
  // chain is transitively a dependency of handleError, which is a useEffect
  // dep in TwitchEmbedPlayer. Unstable here = embed rebuilds every render =
  // Twitch's embed.js spams its own Sentry project with init errors = 429.
  const chain = useMemo(() => getFallbackChain(detection), [detection])
  const initialEngine = getRecommendedEngine(detection)

  const [fallbackStep, setFallbackStep] = useState(0)
  const [activeEngine, setActiveEngine] = useState<PlayerEngine>(initialEngine)
  const [errorReason, setErrorReason] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [lastTransitionAt, setLastTransitionAt] = useState<number>(() =>
    Date.now(),
  )

  // Ref mirror of fallbackStep so advanceFallback can read the latest value
  // without closing over it. Without this, advanceFallback would have
  // fallbackStep in its deps and become a new function on every advance,
  // defeating the memoization chain above.
  const fallbackStepRef = useRef(fallbackStep)
  useEffect(() => {
    fallbackStepRef.current = fallbackStep
  }, [fallbackStep])

  useEffect(() => {
    const engine = getRecommendedEngine(detection)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on prop change
    setFallbackStep(0)
    setActiveEngine(engine)
    setErrorReason(null)
    setIsOffline(false)
    setLastTransitionAt(Date.now())
    dispatch({ type: 'SET_ENGINE', engine, fallbackStep: 0 })
  }, [url, detection, dispatch])

  const advanceFallback = useCallback(
    (error: string) => {
      const currentStep = fallbackStepRef.current
      const nextStep = currentStep + 1
      setLastTransitionAt(Date.now())
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
        setActiveEngine('fallback')
        setErrorReason(error)
        dispatch({
          type: 'SET_ENGINE',
          engine: 'fallback',
          fallbackStep: nextStep,
        })
      }
    },
    [chain, dispatch],
  )

  const resetChain = useCallback(() => {
    const engine = getRecommendedEngine(detection)
    setFallbackStep(0)
    setActiveEngine(engine)
    setErrorReason(null)
    setIsOffline(false)
    setLastTransitionAt(Date.now())
    dispatch({ type: 'SET_ENGINE', engine, fallbackStep: 0 })
  }, [detection, dispatch])

  const handleReady = useCallback(() => {
    setErrorReason(null)
  }, [])

  const handleError = useCallback(
    (error: string) => advanceFallback(error),
    [advanceFallback],
  )

  const handleOffline = useCallback(() => {
    setIsOffline(true)
    setLastTransitionAt(Date.now())
  }, [])

  const handleOnline = useCallback(() => {
    setIsOffline(false)
    setLastTransitionAt(Date.now())
  }, [])

  const toggleDebug = useCallback(() => {
    dispatch({ type: 'TOGGLE_DEBUG' })
  }, [dispatch])

  const playerProps: PlayerProps = {
    url,
    detection,
    onReady: handleReady,
    onError: handleError,
    onOffline: handleOffline,
    onOnline: handleOnline,
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
            <VideoJSPlayer key={url} {...playerProps} />
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

  const contentId = getContentId(detection)
  const parentHost =
    typeof window !== 'undefined' ? window.location.hostname : 'unknown'

  return (
    <div id="player-host-outer" className="absolute inset-0">
      <div id="player-host-inner" className="relative w-full h-full">
      <PlayerErrorBoundary
        key={url}
        fallback={<div id="error-boundary-fallback" style={{ background: 'red', padding: 20, color: 'white', fontSize: 24 }}>ERROR BOUNDARY CAUGHT</div>}
      >
        {renderPlayer()}
      </PlayerErrorBoundary>

      {isOffline && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{
            // Solid-enough dark overlay; no backdrop-filter (Law 6: no
            // decorative glassmorphism — at this opacity blur does nothing).
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
          }}
          role="status"
          aria-live="polite"
        >
          <WifiOff size={40} style={{ color: 'var(--accent-twitch)' }} />
          <div>
            <h3
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {/* Generic across players: channels, YouTube Live, HLS live streams. */}
              {contentId ?? 'Channel'} is offline
            </h3>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--text-muted)' }}
            >
              We&apos;ll auto-resume when the stream goes live.
            </p>
          </div>
        </div>
      )}

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
            <span style={{ color: 'var(--accent-green)' }}>{activeEngine}</span>
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
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Content ID: </span>
            <span>{contentId ?? '(none)'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Parent: </span>
            <span>{parentHost}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Offline: </span>
            <span
              style={{
                color: isOffline
                  ? 'var(--accent-twitch)'
                  : 'var(--text-muted)',
              }}
            >
              {isOffline ? 'yes' : 'no'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Last change: </span>
            <span>
              {new Date(lastTransitionAt).toISOString().slice(11, 19)}
            </span>
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
          <div className="pt-2 flex gap-2 border-t border-white/10">
            <button
              onClick={() => advanceFallback('manual debug advance')}
              className="px-2 py-1 rounded text-xs hover:bg-white/10"
              style={{
                border: '1px solid var(--border-accent)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Force advance fallback chain"
            >
              Force advance →
            </button>
            <button
              onClick={resetChain}
              className="px-2 py-1 rounded text-xs hover:bg-white/10"
              style={{
                border: '1px solid var(--border-accent)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Retry from start of fallback chain"
            >
              Retry from start
            </button>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
