import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import type { PlayerProps } from '../../types/player'

type Player = ReturnType<typeof videojs>

/**
 * Video.js player wrapping HLS (via VHS / videojs-http-streaming) and
 * native MP4. Callbacks are held in refs so the init effect doesn't
 * have to depend on them — without this, every parent re-render that
 * produces a fresh onReady/onError/onPlay/onPause reference would tear
 * down and re-init the player, forcing a full HLS reconnect and 2-5s
 * of buffering.
 */
export default function VideoJSPlayer({
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
  const playerRef = useRef<Player | null>(null)
  const mountedRef = useRef(true)

  // Callback refs — updated every render so event handlers see the
  // latest values without the init effect re-running.
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

    // Determine source type from detection or URL extension
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
        // Muted is required for reliable autoplay under browser policies.
        // Users can unmute via the video.js control bar.
        muted: true,
        fluid: true,
        responsive: true,
        preload: 'auto',
        sources: [{ src: playableUrl, type: sourceType }],
        html5: {
          vhs: {
            // Force the JS-based HLS engine for consistency; native
            // HLS (Safari) has different event timing and breaks our
            // onReady signal.
            overrideNative: true,
          },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      })

      playerRef.current = player

      player.on('ready', () => {
        if (mountedRef.current) onReadyRef.current?.()
      })

      player.on('play', () => {
        if (mountedRef.current) onPlayRef.current?.()
      })

      player.on('pause', () => {
        if (mountedRef.current) onPauseRef.current?.()
      })

      player.on('ended', () => {
        if (mountedRef.current) onEndedRef.current?.()
      })

      player.on('error', () => {
        if (!mountedRef.current) return
        const err = player.error()
        // video.js error code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED, which is
        // what autoplay-blocked manifests as in some browsers. Forward
        // as PLAYBACK_BLOCKED so PlayerHost can advance the chain.
        if (err?.code === 4) {
          onPlaybackBlockedRef.current?.()
          onErrorRef.current?.('Playback blocked: source not supported or autoplay denied')
          return
        }
        onErrorRef.current?.(
          err?.message || `Video.js error code ${err?.code ?? 'unknown'}`,
        )
      })
    } catch (err) {
      onErrorRef.current?.(
        `Video.js initialization failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
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
    // Depend only on the URL + detection identity — callback refs are
    // updated out-of-band in the effect above, so they're intentionally
    // excluded from this dep array.
  }, [url, detection.type, detection.playableUrl])

  return (
    <div data-vjs-player className="w-full h-full" style={{ minHeight: 300 }}>
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered vjs-fluid"
      />
    </div>
  )
}
