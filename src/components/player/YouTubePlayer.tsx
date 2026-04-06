import ReactPlayer from 'react-player'
import type { PlayerProps } from '../../types/player'

export default function YouTubePlayer({
  url,
  onReady,
  onError,
  onPlay,
  onPause,
}: PlayerProps) {
  return (
    <div className="w-full h-full" style={{ minHeight: 300 }}>
      <ReactPlayer
        url={url}
        playing
        controls
        width="100%"
        height="100%"
        onReady={() => onReady?.()}
        onPlay={() => onPlay?.()}
        onPause={() => onPause?.()}
        onError={(err: unknown) =>
          onError?.(
            `YouTube player error: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
        config={{
          playerVars: {
            autoplay: 1,
            modestbranding: 1,
          },
        }}
      />
    </div>
  )
}
