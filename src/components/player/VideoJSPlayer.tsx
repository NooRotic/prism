import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import type { PlayerProps } from '../../types/player'
import { useCallbackRefs } from '../../hooks/useCallbackRefs'
import { setPlayerMetrics, makeMetrics, isTabVisible } from '../../lib/playerMetrics'

type Player = ReturnType<typeof videojs>

/**
 * Video.js player wrapping HLS (via VHS) and native MP4.
 *
 * IMPORTANT: This component MUST be rendered with a `key` prop that
 * changes when the URL changes (e.g. `key={url}`). This forces React
 * to fully unmount/remount instead of reusing the instance, which
 * avoids the removeChild crash from video.js DOM ownership conflicts
 * with React 19 StrictMode.
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
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)

  const cb = useCallbackRefs({
    onReady,
    onError,
    onPlay,
    onPause,
    onEnded,
    onPlaybackBlocked,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const playableUrl = detection.playableUrl || url

    let sourceType = 'video/mp4'
    if (detection.type === 'hls' || playableUrl.includes('.m3u8')) {
      sourceType = 'application/x-mpegURL'
    } else if (detection.type === 'mp4') {
      sourceType = 'video/mp4'
    }

    // Create <video> imperatively so video.js fully owns it.
    const videoEl = document.createElement('video')
    videoEl.className = 'video-js vjs-big-play-centered'
    container.appendChild(videoEl)

    let readyFired = false
    const loadTimeout = setTimeout(() => {
      if (!readyFired) {
        cb.current.onError?.('Stream failed to load within 10 seconds')
      }
    }, 10_000)

    const player = videojs(videoEl, {
      controls: true,
      autoplay: true,
      muted: true,
      fill: true,
      preload: 'auto',
      sources: [{ src: playableUrl, type: sourceType }],
      html5: {
        vhs: { overrideNative: true },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
    })

    playerRef.current = player

    player.on('ready', () => {
      readyFired = true
      clearTimeout(loadTimeout)
      cb.current.onReady?.()
      player.play()?.catch(() => {})
    })

    player.on('play', () => cb.current.onPlay?.())
    player.on('pause', () => cb.current.onPause?.())
    player.on('ended', () => cb.current.onEnded?.())

    player.on('error', () => {
      const err = player.error()
      if (err?.code === 4) {
        cb.current.onPlaybackBlocked?.()
        cb.current.onError?.('Source not supported or autoplay denied')
        return
      }
      cb.current.onError?.(
        err?.message || `Video.js error code ${err?.code ?? 'unknown'}`,
      )
    })

    let retryCount = 0
    player.on('retryplaylist', () => {
      retryCount++
      if (retryCount >= 3) {
        cb.current.onError?.('Stream unavailable — repeated fetch failures (possible CORS issue)')
      }
    })

    // QoE metrics at 1Hz — skip when tab is hidden to save CPU
    const metricsInterval = window.setInterval(() => {
      if (!player || player.isDisposed() || !isTabVisible()) return
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tech = (player as any).tech?.({ IWillNotUseThisInPlugins: true })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vhs = tech?.vhs as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vidEl = (player as any).el?.()?.querySelector('video') as
          | HTMLVideoElement
          | undefined

        let bufferLength: number | null = null
        try {
          const buffered = player.buffered()
          const ct = player.currentTime() ?? 0
          for (let i = 0; i < buffered.length; i++) {
            if (ct >= buffered.start(i) && ct <= buffered.end(i)) {
              bufferLength = buffered.end(i) - ct
              break
            }
          }
        } catch { /* ignore */ }

        let droppedFrames: number | null = null
        if (vidEl && 'getVideoPlaybackQuality' in vidEl) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            droppedFrames = (vidEl as any).getVideoPlaybackQuality().droppedVideoFrames
          } catch { /* ignore */ }
        }

        let bitrate: number | null = null
        let resolution: string | null = null
        try {
          const media = vhs?.playlists?.media?.()
          if (media?.attributes?.BANDWIDTH) bitrate = media.attributes.BANDWIDTH
          if (media?.attributes?.RESOLUTION) {
            const { width, height } = media.attributes.RESOLUTION
            resolution = `${width}x${height}`
          }
        } catch { /* ignore */ }

        let bytesTransferred: number | null = null
        try {
          if (typeof vhs?.stats?.mediaBytesTransferred === 'number') {
            bytesTransferred = vhs.stats.mediaBytesTransferred
          }
        } catch { /* ignore */ }

        setPlayerMetrics(makeMetrics('videojs', {
          currentTime: player.currentTime() ?? null,
          duration: player.duration() ?? null,
          paused: player.paused() ?? null,
          muted: player.muted() ?? null,
          volume: player.volume() ?? null,
          bitrate, resolution, quality: resolution ?? null,
          bufferLength, droppedFrames, bytesTransferred,
        }))
      } catch { /* ignore */ }
    }, 1000)

    return () => {
      clearTimeout(loadTimeout)
      window.clearInterval(metricsInterval)
      setPlayerMetrics(null)
      if (player && !player.isDisposed()) {
        player.dispose()
      }
      playerRef.current = null
      // Clear any DOM nodes video.js left behind
      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // Empty deps — component is keyed by URL, so remount = new URL

  return (
    <div
      id="videojs-container"
      ref={containerRef}
      data-vjs-player
      className="absolute inset-0"
    />
  )
}
