import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { getSourceColor, getURLTypeDisplayName, type StreamKind } from '../lib/urlDetection'
import { buildStreamPath, CUSTOM_STREAM_ID } from '../lib/routes'
import { resolveStreamSource, type StreamSource } from '../lib/streamSource'
import PlayerHost from '../components/player/PlayerHost'
import { StreamErrorCard, StreamStallNotice } from '../components/player/StreamStatus'
import DebugPanel from '../components/layout/DebugPanel'

function StreamNotFound({ streamId, hasUrl }: { streamId: string | undefined; hasUrl: boolean }) {
  let message: string
  if (streamId && streamId !== CUSTOM_STREAM_ID) message = `No stream called “${streamId}”.`
  else if (!hasUrl) message = 'No stream address was given.'
  else message = "That address isn't an HLS, DASH or MP4 stream."

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-5xl mx-auto px-4 md:px-6 pt-12 pb-8 text-center">
      <p className="text-lg" style={{ color: 'var(--text-primary)' }}>
        {message}
      </p>
      <Link to="/hls-dash" className="text-sm underline" style={{ color: 'var(--accent-hls)' }}>
        Browse the HLS / DASH demos
      </Link>
    </div>
  )
}

function StreamPlayer({ source }: { source: StreamSource }) {
  const navigate = useNavigate()
  const { url, detection, kind, guessedKind } = source
  // Retrying remounts the player; a stall notice belongs to one attempt at one address, and this
  // component is remounted (see the key at the call site) whenever the address or type changes.
  const [attempt, setAttempt] = useState(0)
  const [stalled, setStalled] = useState(false)

  const retry = useCallback(() => {
    setStalled(false)
    setAttempt((n) => n + 1)
  }, [])
  const tryAs = useCallback(
    (next: StreamKind) => navigate(buildStreamPath(url, next), { replace: true }),
    [navigate, url],
  )
  const onStall = useCallback(() => setStalled(true), [])
  const onPlaying = useCallback(() => setStalled(false), [])
  const renderError = useCallback(
    (error: string | null) => (
      <StreamErrorCard
        url={url}
        kind={kind}
        guessedKind={guessedKind}
        playerError={error}
        onRetry={retry}
        onTryAs={tryAs}
      />
    ),
    [url, kind, guessedKind, retry, tryAs],
  )

  const accentColor = getSourceColor(detection)

  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2
          className="text-lg font-bold font-heading uppercase tracking-wider"
          style={{ color: accentColor }}
        >
          {getURLTypeDisplayName(detection)} Player
        </h2>
        <span
          className="text-xs truncate font-mono"
          style={{ color: 'var(--text-muted)' }}
          title={url}
        >
          {url}
        </span>
      </div>

      {/* Player */}
      <div
        className="w-full aspect-video rounded-lg overflow-hidden relative"
        style={{
          backgroundColor: '#000',
          border: `2px solid ${accentColor}`,
          boxShadow: `0 0 20px ${accentColor}22`,
        }}
      >
        <PlayerHost
          key={attempt}
          url={url}
          detection={detection}
          renderError={renderError}
          onStall={onStall}
          onPlaying={onPlaying}
        />
      </div>

      {stalled && (
        <StreamStallNotice
          url={url}
          kind={kind}
          guessedKind={guessedKind}
          onRetry={retry}
          onTryAs={tryAs}
        />
      )}

      <DebugPanel />
    </div>
  )
}

export default function HlsDashPlayerPage() {
  const { streamId } = useParams<{ streamId: string }>()
  const [searchParams] = useSearchParams()
  const { state, dispatch } = useApp()

  // Render from what the address asks for, not from the app's player state: that state still holds
  // the previous stream for one frame after a navigation.
  const source = useMemo(
    () => resolveStreamSource(streamId, searchParams),
    [streamId, searchParams],
  )

  // The rest of the app (debug panel, floating window) reads what is playing from app state.
  useEffect(() => {
    if (!source) return
    if (
      state.player.currentUrl !== source.url ||
      state.player.detection?.type !== source.detection.type
    ) {
      dispatch({ type: 'PLAY_URL', url: source.url, detection: source.detection })
    }
  }, [source]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!source) return <StreamNotFound streamId={streamId} hasUrl={searchParams.has('url')} />
  return <StreamPlayer key={`${source.url}|${source.detection.type}`} source={source} />
}
