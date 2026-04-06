import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import type { PlayerProps } from '../../types/player'

type Player = ReturnType<typeof videojs>

export default function VideoJSPlayer({
  url,
  detection,
  onReady,
  onError,
  onPlay,
  onPause,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<Player | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const videoEl = videoRef.current
    if (!videoEl) return

    const playableUrl = detection.playableUrl || url

    // Determine source type
    let sourceType = 'video/mp4'
    if (detection.type === 'hls' || playableUrl.includes('.m3u8')) {
      sourceType = 'application/x-mpegURL'
    } else if (detection.type === 'mp4') {
      sourceType = 'video/mp4'
    }

    try {
      const player = videojs(videoEl, {
        controls: true,
        autoplay: true,
        fluid: true,
        responsive: true,
        preload: 'auto',
        sources: [{ src: playableUrl, type: sourceType }],
        html5: {
          vhs: {
            overrideNative: true,
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      })

      playerRef.current = player

      player.on('ready', () => {
        if (mountedRef.current) onReady?.()
      })

      player.on('play', () => {
        if (mountedRef.current) onPlay?.()
      })

      player.on('pause', () => {
        if (mountedRef.current) onPause?.()
      })

      player.on('error', () => {
        if (mountedRef.current) {
          const err = player.error()
          onError?.(
            err?.message || `Video.js error code ${err?.code ?? 'unknown'}`,
          )
        }
      })
    } catch (err) {
      onError?.(
        `Video.js initialization failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    return () => {
      mountedRef.current = false
      const player = playerRef.current
      if (player && !player.isDisposed()) {
        player.dispose()
      }
      playerRef.current = null
    }
  }, [url, detection, onReady, onError, onPlay, onPause])

  return (
    <div data-vjs-player className="w-full h-full" style={{ minHeight: 300 }}>
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered vjs-fluid"
      />
    </div>
  )
}
