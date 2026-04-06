import { useEffect, useRef, useCallback } from 'react'
import type { PlayerProps } from '../../types/player'

declare global {
  interface Window {
    Twitch?: {
      Embed: new (
        elementId: string,
        options: Record<string, unknown>,
      ) => TwitchEmbedInstance
    }
  }
}

interface TwitchEmbedInstance {
  addEventListener: (event: string, callback: () => void) => void
  getPlayer: () => { pause: () => void; play: () => void }
  destroy: () => void
}

const TWITCH_EMBED_SCRIPT = 'https://embed.twitch.tv/embed/v1.js'
const EMBED_TIMEOUT_MS = 5000

// Static event constants (matches Twitch.Embed values)
const TWITCH_EVENTS = {
  VIDEO_READY: 'video.ready',
  VIDEO_PLAY: 'video.play',
  VIDEO_PAUSE: 'pause',
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
      existing.addEventListener('error', () => reject(new Error('Failed to load Twitch Embed SDK')))
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
  url: _url,
  detection,
  onReady,
  onError,
  onPlay,
  onPause,
}: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<TwitchEmbedInstance | null>(null)
  const mountedRef = useRef(true)
  const embedIdRef = useRef(`twitch-embed-${Date.now()}`)

  const handleError = useCallback(
    (msg: string) => {
      if (mountedRef.current) onError?.(msg)
    },
    [onError],
  )

  useEffect(() => {
    mountedRef.current = true
    const container = containerRef.current
    if (!container) return

    const embedId = embedIdRef.current
    // Ensure the container has the required id
    container.id = embedId

    let timeoutId: ReturnType<typeof setTimeout>

    const init = async () => {
      try {
        await loadTwitchScript()
      } catch {
        handleError('Failed to load Twitch Embed SDK')
        return
      }

      if (!mountedRef.current || !window.Twitch?.Embed) return

      // Build options based on detection
      const options: Record<string, unknown> = {
        width: '100%',
        height: '100%',
        parent: [window.location.hostname],
        layout: 'video',
        autoplay: true,
        allowfullscreen: true,
      }

      if (detection.platform === 'twitch-clip' && detection.metadata?.clipId) {
        options.clip = detection.metadata.clipId
      } else if (
        detection.platform === 'twitch-video' &&
        detection.metadata?.videoId
      ) {
        options.video = detection.metadata.videoId
      } else if (
        detection.platform === 'twitch-stream' &&
        detection.metadata?.channelName
      ) {
        options.channel = detection.metadata.channelName
      } else {
        handleError('Unable to determine Twitch content type')
        return
      }

      try {
        const embed = new window.Twitch.Embed(embedId, options)
        embedRef.current = embed

        embed.addEventListener(TWITCH_EVENTS.VIDEO_READY, () => {
          if (mountedRef.current) {
            clearTimeout(timeoutId)
            onReady?.()
          }
        })

        embed.addEventListener(TWITCH_EVENTS.VIDEO_PLAY, () => {
          if (mountedRef.current) onPlay?.()
        })

        embed.addEventListener(TWITCH_EVENTS.VIDEO_PAUSE, () => {
          if (mountedRef.current) onPause?.()
        })

        // Timeout fallback if embed never fires ready
        timeoutId = setTimeout(() => {
          if (mountedRef.current) {
            handleError('Twitch Embed timed out after 5s')
          }
        }, EMBED_TIMEOUT_MS)
      } catch (err) {
        handleError(
          `Twitch Embed initialization failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }

    init()

    return () => {
      mountedRef.current = false
      clearTimeout(timeoutId)
      try {
        embedRef.current?.destroy()
      } catch {
        // Swallow destroy errors
      }
      embedRef.current = null
      // Clear the container
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
