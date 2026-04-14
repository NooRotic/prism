import type { URLDetectionResult, PlayerEngine } from '../lib/urlDetection'

export interface PlayerProps {
  url: string
  detection: URLDetectionResult
  onReady?: () => void
  onError?: (error: string) => void
  onPlay?: () => void
  onPause?: () => void
  /** Stream-only. Fires when the SDK reports the channel is offline. */
  onOffline?: () => void
  /** Stream-only. Fires when the SDK reports the channel went live. */
  onOnline?: () => void
  /** VOD-only. Fires when playback reaches the end of the video. */
  onEnded?: () => void
  /** Fires when the browser blocks autoplay (policy). Usually triggers fallback. */
  onPlaybackBlocked?: () => void
}

export interface PlayerHostState {
  currentUrl: string
  detection: URLDetectionResult | null
  activeEngine: PlayerEngine
  fallbackStep: number
  debugMode: boolean
  error: string | null
}
