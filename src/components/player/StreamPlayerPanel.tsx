import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { beginPlayback, endPlayback, logPlayback, setPlaybackStatus } from '../../lib/playbackLog'
import { getSourceColor, getURLTypeDisplayName, type StreamKind } from '../../lib/urlDetection'
import { buildStreamPath } from '../../lib/routes'
import type { StreamSource } from '../../lib/streamSource'
import PlayerHost from './PlayerHost'
import { StreamErrorCard, StreamStallNotice } from './StreamStatus'
import DebugPanel from '../layout/DebugPanel'

/** Lets the page know the error view is on screen, so the stall notice can step aside. */
function ReportOnMount({ onMount }: { onMount: () => void }) {
  useEffect(() => {
    onMount()
  }, [onMount])
  return null
}

interface StreamPlayerPanelProps {
  source: StreamSource
  /** The title row (the kind of player and the address). On by default; a page that names the stream elsewhere turns it off. */
  heading?: boolean
  /** Replaces the wrapper's classes, for a page that places the panel in a column of its own. */
  className?: string
  /**
   * What "try as" does. By default it opens the pasted-address page as that type; a page that must stay where it is (the
   * owner's Playlist preview) passes its own handler, which is called instead and nothing is navigated.
   */
  onTryAs?: (kind: StreamKind) => void
}

const DEFAULT_WRAPPER = 'flex flex-col gap-4 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8'

/**
 * The player for one stream with everything around it: retry, "try as" another type, the stall notice, the error card
 * and the debug panel. A retry remounts the player; a stall notice belongs to one attempt at one address, so the caller
 * remounts this component (a key) whenever the address or type changes.
 */
export default function StreamPlayerPanel({ source, heading = true, className, onTryAs }: StreamPlayerPanelProps) {
  const navigate = useNavigate()
  const { url, detection, kind, guessedKind } = source
  const [attempt, setAttempt] = useState(0)
  const [stalled, setStalled] = useState(false)
  // Once the player has given up, the error card already says what the stall notice would.
  const [failed, setFailed] = useState(false)

  // One playback session per stream, for the status and the debug output. It begins in a layout effect, which runs before
  // the effects of the engines below (they write to it), and ends when the panel goes away.
  useLayoutEffect(() => {
    beginPlayback({ url, kind })
    return () => endPlayback()
  }, [url, kind])

  const retry = useCallback(() => {
    logPlayback('info', 'panel', 'Retry pressed')
    setPlaybackStatus('retrying')
    setStalled(false)
    setFailed(false)
    setAttempt((n) => n + 1)
  }, [])
  const tryAs = useCallback(
    (next: StreamKind) => (onTryAs ? onTryAs(next) : navigate(buildStreamPath(url, next), { replace: true })),
    [navigate, url, onTryAs],
  )
  const onStall = useCallback(() => setStalled(true), [])
  const onPlaying = useCallback(() => setStalled(false), [])
  const markFailed = useCallback(() => {
    logPlayback('error', 'panel', 'playback failed: no engine could play it')
    setPlaybackStatus('failed')
    setFailed(true)
  }, [])
  const renderError = useCallback(
    (error: string | null) => (
      <>
        <ReportOnMount onMount={markFailed} />
        <StreamErrorCard
          url={url}
          kind={kind}
          guessedKind={guessedKind}
          playerError={error}
          onRetry={retry}
          onTryAs={tryAs}
        />
      </>
    ),
    [url, kind, guessedKind, retry, tryAs, markFailed],
  )

  const accentColor = getSourceColor(detection)

  return (
    <div className={className ?? DEFAULT_WRAPPER}>
      {heading && (
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
      )}

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

      {stalled && !failed && (
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
