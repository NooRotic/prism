import { useEffect, useRef } from 'react'
import type { PlayerProps } from '../../types/player'

export default function DashJSPlayer({
  url,
  detection,
  onReady,
  onError,
  onPlay,
  onPause,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const videoEl = videoRef.current
    if (!videoEl) return

    const playableUrl = detection.playableUrl || url

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dashPlayer: any = null

    const init = async () => {
      try {
        const dashjs = await import('dashjs')
        if (!mountedRef.current) return

        dashPlayer = dashjs.MediaPlayer().create()

        const onStreamInitialized = () => {
          if (mountedRef.current) onReady?.()
        }
        const onErrorEvent = (e: unknown) => {
          if (mountedRef.current) {
            const errData = e as { error?: { message?: string; code?: number } }
            onError?.(
              errData?.error?.message ||
                `DASH.js error code ${errData?.error?.code ?? 'unknown'}`,
            )
          }
        }

        dashPlayer.on('streamInitialized', onStreamInitialized)
        dashPlayer.on('error', onErrorEvent)

        dashPlayer.initialize(videoEl, playableUrl, true)

        playerRef.current = dashPlayer
      } catch (err) {
        if (mountedRef.current) {
          onError?.(
            `DASH.js initialization failed: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }

    // Attach native video events for play/pause
    const handlePlay = () => {
      if (mountedRef.current) onPlay?.()
    }
    const handlePause = () => {
      if (mountedRef.current) onPause?.()
    }

    videoEl.addEventListener('play', handlePlay)
    videoEl.addEventListener('pause', handlePause)

    init()

    return () => {
      mountedRef.current = false
      videoEl.removeEventListener('play', handlePlay)
      videoEl.removeEventListener('pause', handlePause)
      try {
        dashPlayer?.destroy()
      } catch {
        // Swallow destroy errors
      }
      playerRef.current = null
    }
  }, [url, detection, onReady, onError, onPlay, onPause])

  return (
    <div className="w-full h-full" style={{ minHeight: 300 }}>
      <video
        ref={videoRef}
        controls
        className="w-full h-full bg-black"
        style={{ minHeight: 300 }}
      />
    </div>
  )
}
