import { useEffect, useRef, useCallback } from 'react'
import type { PlayerProps } from '../../types/player'
import { setPlayerMetrics, makeMetrics, isTabVisible } from '../../lib/playerMetrics'

declare global {
  interface Window {
    Twitch?: {
      Embed: TwitchEmbedConstructor
    }
  }
}

interface TwitchEmbedConstructor {
  new (
    elementId: string,
    options: Record<string, unknown>,
  ): TwitchEmbedInstance
  VIDEO_READY: string
  VIDEO_PLAY: string
}

interface TwitchEmbedInstance {
  addEventListener: (event: string, callback: () => void) => void
  getPlayer: () => TwitchPlayerInstance
  destroy: () => void
}

interface TwitchPlayerInstance {
  pause: () => void
  play: () => void
  addEventListener: (event: string, callback: () => void) => void
  // Playback state getters (not documented in our base type above
  // but present on real Twitch.Player — we cast-to-any when calling
  // them since they're not in the SDK's typings either).
  getCurrentTime?: () => number
  getDuration?: () => number
  getMuted?: () => boolean
  getVolume?: () => number
  getQuality?: () => string
  getPlaybackStats?: () => {
    backendVersion: string
    bufferSize: number
    codecs: string
    displayResolution: string
    fps: number
    hlsLatencyBroadcaster: number
    playbackRate: number
    skippedFrames: number
    videoResolution: string
  }
}

const TWITCH_EMBED_SCRIPT = 'https://embed.twitch.tv/embed/v1.js'
// Longer than the iframe-level timeout on purpose: Twitch's embed gates
// VIDEO_READY on its internal autoplay visibility checks, which retry over
// several seconds on localhost. 15s covers the retry loop + StrictMode's
// mount/cleanup/mount double-invoke without killing a working player.
const EMBED_TIMEOUT_MS = 15000
// If the iframe's DOM `load` event fires but VIDEO_READY hasn't arrived
// within this grace window, we treat the iframe's presence as proof the
// SDK is working and call onReady ourselves. This is the backup signal
// for the known-broken "autoplay blocked by style visibility" case.
const IFRAME_LOAD_GRACE_MS = 3000

// Player-level event names (fired on Twitch.Player from embed.getPlayer()).
// Per https://dev.twitch.tv/docs/embed/video-and-clips/ these are string
// constants on Twitch.Player; we hardcode the string values since the
// constructor surfaces them under the `Twitch.Player` global we do not
// import here (and the mock uses the same strings).
const PLAYER_EVT = {
  PAUSE: 'pause',
  PLAY: 'play',
  OFFLINE: 'offline',
  ONLINE: 'online',
  ENDED: 'ended',
  PLAYBACK_BLOCKED: 'playbackBlocked',
} as const

let scriptLoadPromise: Promise<void> | null = null

function loadTwitchScript(): Promise<void> {
  if (window.Twitch?.Embed) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${TWITCH_EMBED_SCRIPT}"]`,
    )
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Twitch Embed SDK')),
      )
      return
    }

    const script = document.createElement('script')
    script.src = TWITCH_EMBED_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptLoadPromise = null
      reject(new Error('Failed to load Twitch Embed SDK'))
    }
    document.head.appendChild(script)
  })

  return scriptLoadPromise
}

export default function TwitchEmbedPlayer({
  url: _url, // eslint-disable-line @typescript-eslint/no-unused-vars
  detection,
  onReady,
  onError,
  onPlay,
  onPause,
  onOffline,
  onOnline,
  onEnded,
  onPlaybackBlocked,
}: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<TwitchEmbedInstance | null>(null)
  const playerRef = useRef<TwitchPlayerInstance | null>(null)
  const mountedRef = useRef(true)
  const embedIdRef = useRef('')
  const metricsIntervalRef = useRef<number | null>(null)

  const handleError = useCallback(
    (msg: string) => {
      if (mountedRef.current) onError?.(msg)
    },
    [onError],
  )

  useEffect(() => {
    mountedRef.current = true

    // Defensive guard: the Twitch JS SDK does not support clips.
    // If we're ever handed one, short-circuit so PlayerHost advances.
    if (detection.platform === 'twitch-clip') {
      handleError('Twitch SDK does not support clips — use iframe engine')
      return
    }

    const container = containerRef.current
    if (!container) return

    if (!embedIdRef.current) {
      embedIdRef.current = `twitch-embed-${Date.now()}-${Math.floor(
        Math.random() * 10000,
      )}`
    }
    const embedId = embedIdRef.current
    container.id = embedId

    // Start the timeout BEFORE async work so the budget covers the full
    // init path (script load + Embed construction + VIDEO_READY).
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => {
        if (mountedRef.current) {
          handleError(
            `Twitch Embed timed out after ${EMBED_TIMEOUT_MS / 1000}s`,
          )
        }
      },
      EMBED_TIMEOUT_MS,
    )
    let iframeLoadGraceId: ReturnType<typeof setTimeout> | undefined

    const clearTimeoutSafe = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
      if (iframeLoadGraceId !== undefined) {
        clearTimeout(iframeLoadGraceId)
        iframeLoadGraceId = undefined
      }
    }

    // Wait until the browser has painted the container so the Twitch SDK's
    // autoplay "style visibility" check runs against real dimensions, not
    // a zero-size pre-layout element. Double-RAF = one commit + one paint.
    const waitForPaint = () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })

    const init = async () => {
      try {
        await loadTwitchScript()
      } catch {
        clearTimeoutSafe()
        handleError('Failed to load Twitch Embed SDK')
        return
      }

      if (!mountedRef.current || !window.Twitch?.Embed) return

      // Give the container one paint cycle so Twitch's autoplay visibility
      // check sees real dimensions, not a zero-size pre-layout element.
      await waitForPaint()
      if (!mountedRef.current || !window.Twitch?.Embed) return

      const Embed = window.Twitch.Embed

      // Build options. `muted: true` is required for reliable autoplay under
      // browser policies. The real Twitch player still shows an unmute button.
      const options: Record<string, unknown> = {
        width: '100%',
        height: '100%',
        parent: [window.location.hostname],
        layout: 'video',
        autoplay: true,
        muted: true,
        allowfullscreen: true,
      }

      if (
        detection.platform === 'twitch-video' &&
        detection.metadata?.videoId
      ) {
        options.video = `v${detection.metadata.videoId}`
      } else if (
        detection.platform === 'twitch-stream' &&
        detection.metadata?.channelName
      ) {
        options.channel = detection.metadata.channelName
      } else {
        clearTimeoutSafe()
        handleError('Unable to determine Twitch content type')
        return
      }

      // Idempotent ready path: two sources can race to call this —
      // (1) Twitch's VIDEO_READY event, (2) the iframe DOM `load` event
      // backup for the "autoplay style visibility" gate. Whichever wins,
      // subsequent calls are no-ops.
      let readyFired = false
      const fireReady = (embed: TwitchEmbedInstance) => {
        if (readyFired || !mountedRef.current) return
        readyFired = true
        clearTimeoutSafe()

        try {
          const player = embed.getPlayer()
          playerRef.current = player

          player.addEventListener(PLAYER_EVT.PAUSE, () => {
            if (mountedRef.current) onPause?.()
          })
          player.addEventListener(PLAYER_EVT.PLAY, () => {
            if (mountedRef.current) onPlay?.()
          })
          player.addEventListener(PLAYER_EVT.ENDED, () => {
            if (mountedRef.current) onEnded?.()
          })
          player.addEventListener(PLAYER_EVT.PLAYBACK_BLOCKED, () => {
            if (mountedRef.current) {
              onPlaybackBlocked?.()
              // Autoplay was blocked by the browser. Advance the chain so
              // the user at least sees an actionable fallback.
              handleError('Autoplay blocked by browser')
            }
          })
          // OFFLINE / ONLINE are only meaningful for live streams.
          if (detection.platform === 'twitch-stream') {
            player.addEventListener(PLAYER_EVT.OFFLINE, () => {
              if (mountedRef.current) onOffline?.()
            })
            player.addEventListener(PLAYER_EVT.ONLINE, () => {
              if (mountedRef.current) onOnline?.()
            })
          }
        } catch {
          handleError('Twitch Player API unavailable')
          return
        }

        // Start 1Hz metrics polling now that the player is ready.
        // Uses the Twitch.Player API's getter methods (getCurrentTime,
        // getDuration, getMuted, getVolume, getPlaybackStats) — these
        // live on the Player instance, not the Embed wrapper.
        metricsIntervalRef.current = window.setInterval(() => {
          const p = playerRef.current
          if (!mountedRef.current || !p || !isTabVisible()) return
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stats = (p as any).getPlaybackStats?.()
            setPlayerMetrics(
              makeMetrics('twitch-sdk', {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                currentTime: (p as any).getCurrentTime?.() ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                duration: (p as any).getDuration?.() ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                muted: (p as any).getMuted?.() ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                volume: (p as any).getVolume?.() ?? null,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                quality: (p as any).getQuality?.() ?? null,
                resolution: stats?.videoResolution ?? null,
                bufferLength: stats?.bufferSize ?? null,
                droppedFrames: stats?.skippedFrames ?? null,
              }),
            )
          } catch {
            // Non-fatal — Twitch's Player API can be flaky mid-buffering.
          }
        }, 1000)

        onReady?.()
      }

      try {
        const embed = new Embed(embedId, options)
        embedRef.current = embed

        // Primary ready signal: Twitch's own event.
        embed.addEventListener(Embed.VIDEO_READY, () => fireReady(embed))

        // Backup ready signal: the DOM `load` event on the iframe that
        // Twitch's SDK just synchronously injected into our container.
        // If VIDEO_READY is silently gated by Twitch's autoplay visibility
        // check (common on localhost non-port-80), iframe load still fires
        // when the player iframe finishes loading. After a short grace
        // window, we fire ready from that signal.
        const iframe = container.querySelector('iframe')
        if (iframe) {
          iframe.addEventListener('load', () => {
            if (readyFired || !mountedRef.current) return
            iframeLoadGraceId = setTimeout(() => {
              if (!readyFired && mountedRef.current) fireReady(embed)
            }, IFRAME_LOAD_GRACE_MS)
          })
        }
      } catch (err) {
        clearTimeoutSafe()
        handleError(
          `Twitch Embed initialization failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }

    init()

    return () => {
      mountedRef.current = false
      clearTimeoutSafe()
      if (metricsIntervalRef.current !== null) {
        window.clearInterval(metricsIntervalRef.current)
        metricsIntervalRef.current = null
      }
      setPlayerMetrics(null)
      try {
        embedRef.current?.destroy()
      } catch {
        // Swallow destroy errors
      }
      embedRef.current = null
      playerRef.current = null
      if (container) container.innerHTML = ''
    }
  }, [
    detection.platform,
    detection.metadata?.clipId,
    detection.metadata?.videoId,
    detection.metadata?.channelName,
    onReady,
    onPlay,
    onPause,
    onOffline,
    onOnline,
    onEnded,
    onPlaybackBlocked,
    handleError,
  ])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 300 }}
    />
  )
}
