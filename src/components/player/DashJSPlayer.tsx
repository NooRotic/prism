import { useEffect, useRef } from 'react'
import type { PlayerProps } from '../../types/player'

/**
 * DASH.js player wrapping MPEG-DASH manifests. dashjs is imported
 * dynamically (async) so the ~300KB bundle only loads when a DASH
 * URL is actually played — streams/clips/VODs never pay the cost.
 *
 * Callbacks held in refs to avoid init-effect re-runs on every parent
 * render (same pattern as VideoJSPlayer).
 */
export default function DashJSPlayer({
  url,
  detection,
  onReady,
  onError,
  onPlay,
  onPause,
  onEnded,
  onPlaybackBlocked,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null)
  const mountedRef = useRef(true)

  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)
  const onPlayRef = useRef(onPlay)
  const onPauseRef = useRef(onPause)
  const onEndedRef = useRef(onEnded)
  const onPlaybackBlockedRef = useRef(onPlaybackBlocked)
  useEffect(() => {
    onReadyRef.current = onReady
    onErrorRef.current = onError
    onPlayRef.current = onPlay
    onPauseRef.current = onPause
    onEndedRef.current = onEnded
    onPlaybackBlockedRef.current = onPlaybackBlocked
  }, [onReady, onError, onPlay, onPause, onEnded, onPlaybackBlocked])

  useEffect(() => {
    mountedRef.current = true
    const videoEl = videoRef.current
    if (!videoEl) return

    const playableUrl = detection.playableUrl || url

    // Attach native video events for play/pause/ended. dashjs's own
    // event API fires PLAYBACK_STARTED/PAUSED too, but the video
    // element's native events are more reliable for React timing.
    const handlePlay = () => {
      if (mountedRef.current) onPlayRef.current?.()
    }
    const handlePause = () => {
      if (mountedRef.current) onPauseRef.current?.()
    }
    const handleEnded = () => {
      if (mountedRef.current) onEndedRef.current?.()
    }

    videoEl.addEventListener('play', handlePlay)
    videoEl.addEventListener('pause', handlePause)
    videoEl.addEventListener('ended', handleEnded)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dashPlayer: any = null

    const init = async () => {
      try {
        const dashjs = await import('dashjs')
        if (!mountedRef.current) return

        dashPlayer = dashjs.MediaPlayer().create()

        const onStreamInitialized = () => {
          if (mountedRef.current) onReadyRef.current?.()
        }
        const onErrorEvent = (e: unknown) => {
          if (!mountedRef.current) return
          const errData = e as {
            error?: { message?: string; code?: number }
          }
          const msg =
            errData?.error?.message ||
            `DASH.js error code ${errData?.error?.code ?? 'unknown'}`
          // Autoplay / source compatibility issues: surface as
          // playback blocked so PlayerHost advances the chain.
          if (
            errData?.error?.code === 25 ||
            msg.toLowerCase().includes('play')
          ) {
            onPlaybackBlockedRef.current?.()
          }
          onErrorRef.current?.(msg)
        }

        dashPlayer.on('streamInitialized', onStreamInitialized)
        dashPlayer.on('error', onErrorEvent)

        // Muted start for autoplay reliability under browser policies.
        // Users can unmute via the native video element controls.
        videoEl.muted = true
        dashPlayer.initialize(videoEl, playableUrl, true)

        playerRef.current = dashPlayer
      } catch (err) {
        if (mountedRef.current) {
          onErrorRef.current?.(
            `DASH.js initialization failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }
    }

    init()

    return () => {
      mountedRef.current = false
      videoEl.removeEventListener('play', handlePlay)
      videoEl.removeEventListener('pause', handlePause)
      videoEl.removeEventListener('ended', handleEnded)
      try {
        dashPlayer?.destroy()
      } catch {
        // Swallow destroy errors
      }
      playerRef.current = null
    }
  }, [url, detection.type, detection.playableUrl])

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
