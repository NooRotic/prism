import { useEffect, useRef } from 'react'
import type { PlayerProps } from '../../types/player'
import { useCallbackRefs } from '../../hooks/useCallbackRefs'
import { setPlayerMetrics, makeMetrics, isTabVisible } from '../../lib/playerMetrics'

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

    // Attach native video events for play/pause/ended. dashjs's own
    // event API fires PLAYBACK_STARTED/PAUSED too, but the video
    // element's native events are more reliable for React timing.
    const handlePlay = () => {
      if (mountedRef.current) cb.current.onPlay?.()
    }
    const handlePause = () => {
      if (mountedRef.current) cb.current.onPause?.()
    }
    const handleEnded = () => {
      if (mountedRef.current) cb.current.onEnded?.()
    }

    videoEl.addEventListener('play', handlePlay)
    videoEl.addEventListener('pause', handlePause)
    videoEl.addEventListener('ended', handleEnded)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dashPlayer: any = null

    let readyFired = false
    const loadTimeout = setTimeout(() => {
      if (!readyFired && mountedRef.current) {
        cb.current.onError?.('DASH stream failed to load within 10 seconds')
      }
    }, 10_000)

    const init = async () => {
      try {
        const dashjs = await import('dashjs')
        if (!mountedRef.current) return

        dashPlayer = dashjs.MediaPlayer().create()

        const onStreamInitialized = () => {
          readyFired = true
          clearTimeout(loadTimeout)
          if (mountedRef.current) cb.current.onReady?.()
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
            cb.current.onPlaybackBlocked?.()
          }
          cb.current.onError?.(msg)
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
          cb.current.onError?.(
            `DASH.js initialization failed: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
        }
      }
    }

    init()

    // ─── QoE metrics emission at 1Hz ───────────────────────────
    // dashjs exposes its own metric API (getDashMetrics +
    // getMetricsFor) for per-track buffer level, dropped frames,
    // ABR switches. We also read the native <video> element for
    // currentTime/duration/muted/volume/paused.
    const metricsInterval = window.setInterval(() => {
      const player = playerRef.current
      if (!mountedRef.current || !player || !isTabVisible()) return

      try {
        // Universal from <video> element
        const currentTime = videoEl.currentTime ?? null
        const duration = Number.isFinite(videoEl.duration)
          ? videoEl.duration
          : null
        const paused = videoEl.paused
        const muted = videoEl.muted
        const volume = videoEl.volume

        // Buffer length ahead of playhead
        let bufferLength: number | null = null
        try {
          const buffered = videoEl.buffered
          for (let i = 0; i < buffered.length; i++) {
            const start = buffered.start(i)
            const end = buffered.end(i)
            if (currentTime !== null && currentTime >= start && currentTime <= end) {
              bufferLength = end - currentTime
              break
            }
          }
        } catch {
          // ignore
        }

        // Dropped frames from <video> getVideoPlaybackQuality
        let droppedFrames: number | null = null
        if ('getVideoPlaybackQuality' in videoEl) {
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

        // dashjs-specific: current bitrate + resolution
        let bitrate: number | null = null
        let resolution: string | null = null
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bitrateInfo = (player as any).getCurrentTrackFor?.('video')
          if (
            bitrateInfo?.bitrateList &&
            typeof player.getQualityFor === 'function'
          ) {
            const qualityIdx = player.getQualityFor('video')
            const selected = bitrateInfo.bitrateList[qualityIdx]
            if (selected) {
              bitrate = selected.bandwidth ?? null
              if (selected.width && selected.height) {
                resolution = `${selected.width}x${selected.height}`
              }
            }
          }
        } catch {
          // ignore — fall back to null
        }

        setPlayerMetrics(
          makeMetrics('dashjs', {
            currentTime,
            duration,
            paused,
            muted,
            volume,
            bitrate,
            resolution,
            quality: resolution ?? null,
            bufferLength,
            droppedFrames,
          }),
        )
      } catch {
        // Don't let metric polling break the player.
      }
    }, 1000)

    return () => {
      mountedRef.current = false
      clearTimeout(loadTimeout)
      window.clearInterval(metricsInterval)
      setPlayerMetrics(null)
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
    // `cb` has stable identity via useCallbackRefs — including it
    // satisfies exhaustive-deps without causing re-runs.
  }, [url, detection.type, detection.playableUrl, cb])

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
