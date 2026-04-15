import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import type { PlayerProps } from '../../types/player'
import { useCallbackRefs } from '../../hooks/useCallbackRefs'
import { setPlayerMetrics, makeMetrics } from '../../lib/playerMetrics'

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

  // Callback refs via the shared useCallbackRefs helper — event
  // handlers read from cb.current so the init effect doesn't need
  // the callbacks in its dep array.
  const cb = useCallbackRefs({
    onReady,
    onError,
    onPlay,
    onPause,
    onEnded,
    onPlaybackBlocked,
  })

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
        if (mountedRef.current) cb.current.onReady?.()
      })

      player.on('play', () => {
        if (mountedRef.current) cb.current.onPlay?.()
      })

      player.on('pause', () => {
        if (mountedRef.current) cb.current.onPause?.()
      })

      player.on('ended', () => {
        if (mountedRef.current) cb.current.onEnded?.()
      })

      player.on('error', () => {
        if (!mountedRef.current) return
        const err = player.error()
        // video.js error code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED, which is
        // what autoplay-blocked manifests as in some browsers. Forward
        // as PLAYBACK_BLOCKED so PlayerHost can advance the chain.
        if (err?.code === 4) {
          cb.current.onPlaybackBlocked?.()
          cb.current.onError?.(
            'Playback blocked: source not supported or autoplay denied',
          )
          return
        }
        cb.current.onError?.(
          err?.message || `Video.js error code ${err?.code ?? 'unknown'}`,
        )
      })
    } catch (err) {
      cb.current.onError?.(
        `Video.js initialization failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }

    // ─── QoE metrics emission ───────────────────────────────────
    // Poll the player + underlying <video> element + VHS stats at
    // 1Hz and push a snapshot into the module-level playerMetrics
    // store. DebugPanel subscribes to read live values.
    const metricsInterval = window.setInterval(() => {
      const player = playerRef.current
      if (!mountedRef.current || !player || player.isDisposed()) return

      try {
        // video.js wraps the underlying <video> element; we can
        // query it for canonical playback state and VHS adds HLS
        // stats under player.tech().vhs.stats.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tech = (player as any).tech?.({ IWillNotUseThisInPlugins: true })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vhs = tech?.vhs as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoEl = (player as any).el?.()?.querySelector('video') as
          | HTMLVideoElement
          | undefined

        // Buffer length ahead of current playhead (seconds).
        let bufferLength: number | null = null
        try {
          const buffered = player.buffered()
          const currentTime = player.currentTime() ?? 0
          for (let i = 0; i < buffered.length; i++) {
            const start = buffered.start(i)
            const end = buffered.end(i)
            if (currentTime >= start && currentTime <= end) {
              bufferLength = end - currentTime
              break
            }
          }
        } catch {
          // ignore
        }

        // Dropped frames from the native <video> element.
        let droppedFrames: number | null = null
        if (videoEl && 'getVideoPlaybackQuality' in videoEl) {
          try {
            const quality = (
              videoEl as HTMLVideoElement & {
                getVideoPlaybackQuality: () => {
                  droppedVideoFrames: number
                }
              }
            ).getVideoPlaybackQuality()
            droppedFrames = quality.droppedVideoFrames
          } catch {
            // ignore
          }
        }

        // Bitrate of currently-selected HLS rendition (bps).
        let bitrate: number | null = null
        let resolution: string | null = null
        try {
          const playlists = vhs?.playlists
          const media = playlists?.media?.()
          if (media?.attributes?.BANDWIDTH) {
            bitrate = media.attributes.BANDWIDTH
          }
          if (media?.attributes?.RESOLUTION) {
            const { width, height } = media.attributes.RESOLUTION
            resolution = `${width}x${height}`
          }
        } catch {
          // ignore
        }

        // Bytes transferred from VHS stats.
        let bytesTransferred: number | null = null
        try {
          if (typeof vhs?.stats?.mediaBytesTransferred === 'number') {
            bytesTransferred = vhs.stats.mediaBytesTransferred
          }
        } catch {
          // ignore
        }

        setPlayerMetrics(
          makeMetrics('videojs', {
            currentTime: player.currentTime() ?? null,
            duration: player.duration() ?? null,
            paused: player.paused() ?? null,
            muted: player.muted() ?? null,
            volume: player.volume() ?? null,
            bitrate,
            resolution,
            quality: resolution ?? null,
            bufferLength,
            droppedFrames,
            bytesTransferred,
          }),
        )
      } catch {
        // Don't let metric polling break the player.
      }
    }, 1000)

    return () => {
      mountedRef.current = false
      window.clearInterval(metricsInterval)
      setPlayerMetrics(null)
      const player = playerRef.current
      if (player && !player.isDisposed()) {
        player.dispose()
      }
      playerRef.current = null
    }
    // Depend only on the URL + detection identity. `cb` is a ref
    // object with stable identity (useCallbackRefs), so including it
    // is a no-op while still satisfying react-hooks/exhaustive-deps.
  }, [url, detection.type, detection.playableUrl, cb])

  return (
    <div data-vjs-player className="w-full h-full" style={{ minHeight: 300 }}>
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered vjs-fluid"
      />
    </div>
  )
}
