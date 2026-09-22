/**
 * Minimal typed surface for the runtime APIs we use on player SDKs.
 *
 * Why these and not the libraries' shipped types? dashjs's types are
 * incomplete, Video.js types are deliberately ignored (see
 * `node_modules/.ignored/@types/video.js`), and the Twitch Embed
 * Player is loaded via script tag with no types at all.
 *
 * These interfaces document exactly what we touch — they are NOT meant
 * to mirror the full SDK API. Add methods only when they're consumed.
 */

// ---------------------------------------------------------------------------
// dashjs
// ---------------------------------------------------------------------------

/** dashjs MediaPlayer track info shape returned by getCurrentTrackFor. */
export interface DashTrackInfo {
  bitrateList?: Array<{
    bandwidth?: number
    width?: number
    height?: number
  }>
}

/**
 * Subset of dashjs MediaPlayer instance methods we call directly.
 * `getCurrentTrackFor` and `getQualityFor` are legacy APIs not present
 * in current dashjs types but still functional at runtime.
 */
export interface DashPlayerWithTracks {
  getCurrentTrackFor?: (type: string) => DashTrackInfo | undefined
  getQualityFor?: (type: string) => number
}

// ---------------------------------------------------------------------------
// Twitch Embed Player
// ---------------------------------------------------------------------------

/** Twitch Player playback stats as returned by getPlaybackStats(). */
export interface TwitchPlaybackStats {
  videoResolution?: string
  bufferSize?: number
  skippedFrames?: number
}

/**
 * Subset of the Twitch Embed Player instance API.
 * Reference: https://dev.twitch.tv/docs/embed/video-and-clips/#javascript-interface-for-the-twitch-embed-player
 */
export interface TwitchPlayerInstance {
  getPlaybackStats?: () => TwitchPlaybackStats | undefined
  getCurrentTime?: () => number | undefined
  getDuration?: () => number | undefined
  getMuted?: () => boolean | undefined
  getVolume?: () => number | undefined
  getQuality?: () => string | undefined
}

// ---------------------------------------------------------------------------
// Video.js + VHS
// ---------------------------------------------------------------------------

/** VHS playlist shape — exposed via player.tech().vhs.playlists.media(). */
export interface VhsMediaPlaylist {
  attributes?: {
    BANDWIDTH?: number
    RESOLUTION?: { width: number; height: number }
  }
}

/** VHS API surface attached to the tech instance. */
export interface VhsApi {
  playlists?: {
    media?: () => VhsMediaPlaylist | undefined
  }
  stats?: {
    mediaBytesTransferred?: number
  }
}

/** Video.js Tech instance with VHS extension. */
export interface VideoJsTechWithVhs {
  vhs?: VhsApi
}

/**
 * Internal Video.js Player methods we touch that aren't fully covered
 * by the project's type setup. `tech()` and `el()` are stable Video.js
 * APIs but are typed loosely — so we narrow them ourselves.
 */
export interface VideoJsPlayerInternals {
  tech?: (opts: { IWillNotUseThisInPlugins: true }) => VideoJsTechWithVhs | undefined
  el?: () => HTMLElement | undefined
}
