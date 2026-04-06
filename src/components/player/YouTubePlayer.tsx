import ReactPlayer from 'react-player'
import type { PlayerProps } from '../../types/player'

export default function YouTubePlayer({
  url,
  detection: _detection,
  onReady,
  onError,
  onPlay,
  onPause,
}: PlayerProps) {
  return (
    <div className="w-full h-full" style={{ minHeight: 300 }}>
      <ReactPlayer
        src={url}
        playing
        controls
        width="100%"
        height="100%"
        onReady={() => onReady?.()}
        onPlay={() => onPlay?.()}
        onPause={() => onPause?.()}
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
