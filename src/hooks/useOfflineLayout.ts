import { useState } from 'react'
import { useApp } from '../contexts/AppContext'
import type { URLDetectionResult } from '../lib/urlDetection'

export interface OfflineLayout {
  /** The page should use the offline layout: signed in, this channel's data loaded, and it is not live. */
  offline: boolean
  /** Offline and the viewer has not asked for the player (and has not chosen something to play). */
  folded: boolean
  showPlayer: () => void
}

/** True for a detection that is not this channel's own live stream: a clip, a recording, or another stream. */
function playsSomethingElse(detection: URLDetectionResult | null, channelKey: string): boolean {
  if (detection === null) return false
  if (detection.platform === 'twitch-clip' || detection.platform === 'twitch-video') return true
  return (
    detection.platform === 'twitch-stream' &&
    detection.metadata?.channelName?.toLowerCase() !== channelKey
  )
}

/**
 * Whether a channel page uses the offline layout, and whether its player is folded. "Offline"
 * needs the profile loaded for THIS channel (a previous channel's data stays in the state until
 * the new one arrives), so a route change never folds a channel whose data is not here yet.
 * The viewer unfolds with `showPlayer`, or by choosing a clip, a recording or another stream.
 * The choice lasts while the page stays offline on the same channel.
 */
export function useOfflineLayout(channel: string | undefined): OfflineLayout {
  const { state } = useApp()
  const { profile, isLive } = state.channel
  const channelKey = channel?.toLowerCase() ?? ''
  const offline =
    state.auth.isAuthenticated &&
    channelKey !== '' &&
    profile !== null &&
    profile.login.toLowerCase() === channelKey &&
    !isLive

  const [unfolded, setUnfolded] = useState(false)
  const [seen, setSeen] = useState({ channelKey, offline })
  // The choice ends when the channel changes or the page stops being offline. Adjusting state
  // while rendering (not in an effect) keeps the unfolded player from flashing for a render.
  if (seen.channelKey !== channelKey || seen.offline !== offline) {
    setSeen({ channelKey, offline })
    if (unfolded) setUnfolded(false)
  } else if (offline && !unfolded && playsSomethingElse(state.player.detection, channelKey)) {
    setUnfolded(true)
  }

  const showPlayer = () => setUnfolded(true)
  const stillUnfolded = unfolded && seen.channelKey === channelKey && seen.offline === offline
  return { offline, folded: offline && !stillUnfolded, showPlayer }
}
