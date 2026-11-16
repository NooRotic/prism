import { useEffect, useRef, useState } from 'react'
import ReactPlayer from 'react-player'
import type { PlayerProps } from '../../types/player'
import { setPlayerMetrics, makeMetrics } from '../../lib/playerMetrics'
import { readSavedVolume, saveVolume } from '../../lib/playerVolume'

/**
 * YouTube player wrapping react-player. Handles both VOD
 * (youtube.com/watch?v=X, youtu.be/X) and live (youtube.com/live/X)
 * URLs — react-player's URL detection routes them to the right
 * iframe API under the hood.
 *
 * Kept thin: no init effect, no callback refs, because react-player
 * manages its own lifecycle and invokes our callback props directly.
 * PlayerHost's memoized handleReady/handleError callbacks don't
 * cause re-init issues here the way they would for video.js —
 * react-player's internal state isn't tied to our callbacks.
 */
export default function YouTubePlayer({
  url,
  onReady,
  onError,
  onPlay,
  onPause,
  onEnded,
}: PlayerProps) {
  // The viewer's saved volume (volume only: the muted start below is the autoplay policy's, never overridden). A change is
  // saved only once playback has begun, so an early report of the element's default volume cannot overwrite it.
  const [savedVolume] = useState(readSavedVolume)
  const playedRef = useRef(false)

  // Minimal metrics emission — react-player doesn't expose a
  // playbackStats API, so we can only report the engine name + the
  // lifecycle state we know from events. Bitrate/buffer/resolution
  // stay null because YouTube's iframe API doesn't surface them.
  // Cleanup on unmount clears the store so stale data doesn't show.
  useEffect(() => {
    setPlayerMetrics(makeMetrics('reactplayer'))
    return () => {
      setPlayerMetrics(null)
    }
  }, [url])

  const emitState = (partial: Partial<ReturnType<typeof makeMetrics>>) => {
    setPlayerMetrics(makeMetrics('reactplayer', partial))
  }

  return (
    <div className="w-full h-full" style={{ minHeight: 300 }}>
      <ReactPlayer
        src={url}
        playing
        controls
        // Muted start so autoplay works under browser policies.
        // Users can unmute via the embedded YouTube control bar.
        muted
        volume={savedVolume ?? undefined}
        onVolumeChange={(event) => {
          if (playedRef.current) saveVolume(event.currentTarget.volume)
        }}
        width="100%"
        height="100%"
        onReady={() => {
          emitState({ paused: false, muted: true })
          onReady?.()
        }}
        onPlay={() => {
          playedRef.current = true
          emitState({ paused: false, muted: true })
          onPlay?.()
        }}
        onPause={() => {
          emitState({ paused: true, muted: true })
          onPause?.()
        }}
        onEnded={() => {
          emitState({ paused: true, muted: true })
          onEnded?.()
        }}
        onError={() => onError?.('YouTube player encountered an error')}
        config={{
          youtube: {
            enablejsapi: 1,
          },
        }}
      />
    </div>
  )
}
