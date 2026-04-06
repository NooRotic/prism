import { useEffect, useRef, useCallback, useState } from 'react'
import type { PlayerProps } from '../../types/player'
import { buildTwitchEmbedUrl } from '../../lib/urlDetection'

const LOAD_TIMEOUT_MS = 5000

export default function TwitchIframePlayer({
  detection,
  onReady,
  onError,
  onPlay,
  onPause: _onPause,
}: PlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const mountedRef = useRef(true)
  const [loaded, setLoaded] = useState(false)

  const handleError = useCallback(
    (msg: string) => {
      if (mountedRef.current) onError?.(msg)
    },
    [onError],
  )

  const embedUrl = buildTwitchEmbedUrl(detection)

  useEffect(() => {
    mountedRef.current = true

    if (!embedUrl) {
      handleError('Could not build Twitch embed URL')
      return
    }

    // Timeout: if iframe hasn't loaded within 5s, treat as failure
    const timeoutId = setTimeout(() => {
      if (mountedRef.current && !loaded) {
        handleError('Twitch iframe timed out after 5s')
      }
    }, LOAD_TIMEOUT_MS)

    return () => {
      mountedRef.current = false
      clearTimeout(timeoutId)
    }
  }, [embedUrl, loaded, handleError])

  const handleLoad = useCallback(() => {
    if (!mountedRef.current) return
    setLoaded(true)
    onReady?.()
    // Iframe player doesn't give us play/pause events natively,
    // so we fire onPlay on load since autoplay is enabled
    onPlay?.()
  }, [onReady, onPlay])

  const handleIframeError = useCallback(() => {
    handleError('Twitch iframe failed to load')
  }, [handleError])

  if (!embedUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-[var(--bg-card)]">
        <p className="text-[var(--text-muted)]">
          Unable to construct Twitch embed URL
        </p>
      </div>
    )
  }

  return (
    <iframe
      ref={iframeRef}
      src={embedUrl}
      title="Twitch Player"
      className="w-full h-full border-0"
      style={{ minHeight: 300 }}
      allowFullScreen
      allow="autoplay; encrypted-media; fullscreen"
      onLoad={handleLoad}
      onError={handleIframeError}
    />
  )
}
