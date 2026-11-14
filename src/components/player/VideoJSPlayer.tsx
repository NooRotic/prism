import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import type { PlayerProps } from '../../types/player'
import type { VideoJsPlayerInternals } from '../../types/player-sdk'
import { useCallbackRefs } from '../../hooks/useCallbackRefs'
import { setPlayerMetrics, makeMetrics, isTabVisible } from '../../lib/playerMetrics'
import { logger } from '../../lib/logger'
import { describeDecoding } from '../../lib/playbackEnvironment'
import { playbackWriter, redactAddress, type PlaybackLevel } from '../../lib/playbackLog'
import {
  MAX_RECOVERIES,
  avoidFormat,
  avoidedFormats,
  failingPlaylistId,
  installRenditionGuard,
  isRenditionGuardInstalled,
  isVideoAppendFailure,
  planDecodeRecovery,
} from '../../lib/renditionGuard'

type Player = ReturnType<typeof videojs>

/** How long a stream may go without loading its first data before the page is told. */
const STALL_MS = 12_000

// Video.js treats a decode failure of one rendition as fatal. With this, a format that failed to decode can be turned off
// and the stream reloaded (see the error handler below). A no-op where there is no `Vhs` (tests that stand in for video.js).
installRenditionGuard(videojs)

/** The little of the tech's `vhs` the recovery and the inspection read. Everything on it is optional and read inside a try. */
interface VhsView {
  playlists?: {
    media?: () => { attributes?: { CODECS?: string; BANDWIDTH?: number; RESOLUTION?: { width: number; height: number } } } | undefined
    main?: { playlists?: Array<{ id?: string; attributes?: { CODECS?: string; RESOLUTION?: { width: number; height: number } }; disabled?: boolean }> }
  }
}

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
  onStall,
  onPlaying,
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
    onStall,
    onPlaying,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const playableUrl = detection.playableUrl || url

    // Everything this player writes to the playback log goes through this: it writes for the session that is running now
    // and for no other, so a late event from this player cannot reach the next stream's session.
    const out = playbackWriter()

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

    // video.js fires `ready` right after it initialises, long before any media has loaded, so
    // "started" means the first data arrived (or playback began), not `ready`.
    let started = false
    const stallTimer = setTimeout(() => {
      if (started) return
      out.log('warn', 'videojs', 'no data after 12 seconds')
      // A stall is not a failure: the player keeps loading, so only tell the page when it listens.
      if (cb.current.onStall) cb.current.onStall()
      else cb.current.onError?.('Stream failed to load within 12 seconds')
    }, STALL_MS)
    const markStarted = () => {
      started = true
      clearTimeout(stallTimer)
    }

    // Starts with sound, and starts it ourselves (see `startPlayback`): the `autoplay` attribute cannot fall back to muted.
    const player = videojs(videoEl, {
      controls: true,
      autoplay: false,
      muted: false,
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

    const log = (level: PlaybackLevel, message: string, data?: Record<string, unknown>) => out.log(level, 'videojs', message, data)
    log('info', `loading ${redactAddress(playableUrl)} as ${sourceType}`)
    if (isRenditionGuardInstalled()) log('info', 'rendition guard active')
    else log('warn', 'rendition guard NOT installed: a rendition that fails to decode cannot be skipped (did Video.js change?)')

    const readVhs = (): VhsView | undefined => {
      try {
        const tech = (player as unknown as { tech?: (options: object) => { vhs?: VhsView } | undefined }).tech?.({ IWillNotUseThisInPlugins: true })
        return tech?.vhs
      } catch {
        return undefined
      }
    }

    // How many times this stream has been reloaded after a decode failure (see the error handler).
    let recoveries = 0

    /** The state of the media element and of the rendition, for the debug output. Every read is guarded: it must never throw. */
    const inspect = (code: number | undefined, message: string | undefined): Record<string, unknown> => {
      const out: Record<string, unknown> = { errorCode: code ?? null, errorMessage: message ?? null, recoveries, avoidedFormats: avoidedFormats() }
      try {
        out.readyState = videoEl.readyState
        out.networkState = videoEl.networkState
        out.mediaError = videoEl.error ? `${videoEl.error.code}: ${videoEl.error.message}` : null
        out.currentTime = Number(videoEl.currentTime.toFixed(2))
        out.paused = videoEl.paused
        out.decodedSize = `${videoEl.videoWidth}x${videoEl.videoHeight}`
        const box = videoEl.getBoundingClientRect()
        out.boxSize = `${Math.round(box.width)}x${Math.round(box.height)}`
        const ranges: string[] = []
        for (let i = 0; i < videoEl.buffered.length; i++) ranges.push(`${videoEl.buffered.start(i).toFixed(1)}-${videoEl.buffered.end(i).toFixed(1)}`)
        out.buffered = ranges.length > 0 ? ranges.join(', ') : '(nothing)'
      } catch {
        /* ignore */
      }
      try {
        const vhs = readVhs()
        const media = vhs?.playlists?.media?.()
        const size = media?.attributes?.RESOLUTION
        if (size) out.rendition = `${size.width}x${size.height}`
        if (media?.attributes?.BANDWIDTH) out.renditionBandwidth = media.attributes.BANDWIDTH
        if (media?.attributes?.CODECS) out.renditionCodecs = media.attributes.CODECS
        const all = vhs?.playlists?.main?.playlists
        if (all) {
          out.renditionsTotal = all.length
          out.renditionsOff = all.filter((item) => item.disabled).length
        }
      } catch {
        /* ignore */
      }
      return out
    }

    // Browsers let a page start sound by itself only once the visitor has used it (a click, or enough earlier listening). So
    // a refused start with sound is tried again muted, which is always allowed: the video starts, and the speaker button
    // in the controls turns the sound on. If even that is refused the page is told, as before.
    const onPlayRejected = (err: Error) => {
      // AbortError fires when play() is interrupted by another action (e.g. switching streams): intentional, ignore.
      if (err.name === 'AbortError') return
      if (err.name === 'NotAllowedError') {
        if (!player.muted()) {
          log('warn', 'the browser blocked autoplay with sound; playing muted (the speaker button turns the sound on)')
          player.muted(true)
          player.play()?.catch(onPlayRejected)
          return
        }
        cb.current.onPlaybackBlocked?.()
        return
      }
      logger.warn('[VideoJSPlayer] play() rejected:', err)
    }

    /** Plays, with sound first when `withSound` (a reload keeps whatever the sound state is now). */
    const startPlayback = (withSound: boolean) => {
      if (withSound) player.muted(false)
      player.play()?.catch(onPlayRejected)
    }

    player.on('loadstart', () => log('info', 'loadstart'))
    player.on('loadedmetadata', () => log('info', `loadedmetadata (${videoEl.videoWidth}x${videoEl.videoHeight})`))
    player.on('canplay', () => log('info', 'canplay'))
    player.on('waiting', () => log('warn', 'waiting for data (buffering)'))
    player.on('stalled', () => log('warn', 'the network stalled'))
    player.on('loadeddata', () => log('info', 'loadeddata'))
    player.on('loadeddata', markStarted)
    player.on('playing', () => {
      markStarted()
      log('ok', 'playing')
      out.setStatus('playing')
      cb.current.onPlaying?.()
    })

    player.on('ready', () => {
      cb.current.onReady?.()
      startPlayback(true)
    })

    player.on('play', () => cb.current.onPlay?.())
    player.on('pause', () => cb.current.onPause?.())
    player.on('ended', () => cb.current.onEnded?.())

    player.on('error', () => {
      const err = player.error()
      const vhs = readVhs()
      let failingCodecs: string | undefined
      let failingSize: { width: number; height: number } | undefined
      let playlistCodecs: Array<string | undefined> = []
      try {
        // An append failure names the playlist it failed on: prefer that over the one Video.js shows as current.
        const media = vhs?.playlists?.media?.()
        const all = vhs?.playlists?.main?.playlists ?? []
        const named = failingPlaylistId(err?.message)
        const failed = named === null ? undefined : all.find((item) => item.id === named)
        failingCodecs = failed?.attributes?.CODECS ?? media?.attributes?.CODECS
        failingSize = failed?.attributes?.RESOLUTION ?? media?.attributes?.RESOLUTION
        playlistCodecs = all.map((item) => item.attributes?.CODECS)
      } catch {
        /* ignore */
      }
      log('error', `Video.js error ${err?.code ?? 'unknown'}: ${err?.message ?? '(no message)'}`, { code: err?.code ?? null, codecs: failingCodecs ?? null })

      if (err?.code === 3) {
        // Video.js treats a failed append of a video segment as fatal. Often another rendition of the same stream would
        // play (an HDR HEVC one that this machine cannot decode, next to an H.264 one), so turn that video format off
        // and reload, at most MAX_RECOVERIES times; after that the page hears about the failure as it always did. Code 3
        // is also Video.js's word for other failures (no working playlist, audio appends): those are not retried here.
        if (failingCodecs && isVideoAppendFailure(err.message)) void describeDecoding(failingCodecs, failingSize).then((line) => log('info', line))
        const plan = planDecodeRecovery({ code: err.code, message: err.message, attempts: recoveries, failingCodecs, playlistCodecs })
        if (plan.retry) {
          recoveries++
          avoidFormat(plan.family)
          log('warn', `${plan.family} failed to decode; avoiding it and reloading (recovery ${recoveries} of ${MAX_RECOVERIES})`)
          out.setStatus('retrying')
          try {
            // Video.js clears an error when given null; its type declarations leave null out.
            ;(player as unknown as { error(value: null): void }).error(null)
            player.src({ src: playableUrl, type: sourceType })
            startPlayback(false)
            return
          } catch (reloadError) {
            log('error', `reload failed: ${reloadError instanceof Error ? reloadError.message : String(reloadError)}`)
          }
        } else {
          log('info', `not retrying: ${plan.reason}`)
        }
      }

      out.setInspection(inspect(err?.code, err?.message))
      if (err?.code === 4) {
        cb.current.onPlaybackBlocked?.()
        cb.current.onError?.('Video.js could not use this source (code 4)')
        return
      }
      cb.current.onError?.(
        err?.message || `Video.js error code ${err?.code ?? 'unknown'}`,
      )
    })

    let retryCount = 0
    player.on('retryplaylist', () => {
      retryCount++
      log('warn', `playlist fetch failed (retry ${retryCount})`)
      if (retryCount >= 3) {
        cb.current.onError?.('Stream unavailable — repeated fetch failures (possible CORS issue)')
      }
    })

    // The rendition in use, so a change shows up in the log.
    let lastRendition: string | null = null

    // QoE metrics at 1Hz — skip when tab is hidden to save CPU
    const metricsInterval = window.setInterval(() => {
      if (!player || player.isDisposed() || !isTabVisible()) return
      try {
        const internals = player as unknown as VideoJsPlayerInternals
        const tech = internals.tech?.({ IWillNotUseThisInPlugins: true })
        const vhs = tech?.vhs
        const vidEl = internals.el?.()?.querySelector('video') as
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
            droppedFrames = vidEl.getVideoPlaybackQuality().droppedVideoFrames
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

        if (resolution !== null && resolution !== lastRendition) {
          lastRendition = resolution
          log('info', `rendition ${resolution}${bitrate ? ` at ${Math.round(bitrate / 1000)} kbps` : ''}`)
        }

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
      clearTimeout(stallTimer)
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
