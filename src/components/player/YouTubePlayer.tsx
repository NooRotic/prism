import ReactPlayer from 'react-player'
import type { PlayerProps } from '../../types/player'

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
  return (
    <div className="w-full h-full" style={{ minHeight: 300 }}>
      <ReactPlayer
        src={url}
        playing
        controls
        // Muted start so autoplay works under browser policies.
        // Users can unmute via the embedded YouTube control bar.
        muted
        width="100%"
        height="100%"
        onReady={() => onReady?.()}
        onPlay={() => onPlay?.()}
        onPause={() => onPause?.()}
        onEnded={() => onEnded?.()}
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
