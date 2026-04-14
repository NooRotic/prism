export interface URLDetectionResult {
  type: 'twitch' | 'youtube' | 'hls' | 'dash' | 'mp4' | 'unknown'
  platform?: 'twitch-clip' | 'twitch-video' | 'twitch-stream'
  originalUrl: string
  playableUrl?: string
  metadata?: {
    clipId?: string
    videoId?: string
    channelName?: string
  }
}

export type PlayerEngine = 'twitch-sdk' | 'twitch-iframe' | 'videojs' | 'dashjs' | 'reactplayer' | 'fallback'

export function detectURLType(url: string): URLDetectionResult {
  if (!url || typeof url !== 'string') {
    return { type: 'unknown', originalUrl: url || '' }
  }

  const cleanUrl = url.trim().toLowerCase()

  if (isTwitchURL(cleanUrl)) {
    return detectTwitchURL(url)
  }

  if (isYouTubeURL(cleanUrl)) {
    return { type: 'youtube', originalUrl: url, playableUrl: url }
  }

  if (cleanUrl.includes('.m3u8') || cleanUrl.includes('m3u8')) {
    return { type: 'hls', originalUrl: url, playableUrl: url }
  }

  if (cleanUrl.includes('.mpd')) {
    return { type: 'dash', originalUrl: url, playableUrl: url }
  }

  if (cleanUrl.includes('.mp4') || cleanUrl.includes('.mov') || cleanUrl.includes('.avi')) {
    return { type: 'mp4', originalUrl: url, playableUrl: url }
  }

  return { type: 'unknown', originalUrl: url, playableUrl: url }
}

export function isTwitchURL(url: string): boolean {
  const cleanUrl = url.toLowerCase()
  return cleanUrl.includes('twitch.tv') || cleanUrl.includes('clips.twitch.tv') || cleanUrl.includes('m.twitch.tv')
}

export function isYouTubeURL(url: string): boolean {
  const cleanUrl = url.toLowerCase()
  return (
    cleanUrl.includes('youtube.com/watch') ||
    cleanUrl.includes('youtu.be/') ||
    cleanUrl.includes('youtube.com/live/')
  )
}

export function detectTwitchURL(url: string): URLDetectionResult {
  const cleanUrl = url.trim()

  // Twitch clip: clips.twitch.tv/ClipSlug or twitch.tv/username/clip/ClipSlug
  const clipRegex = /(?:clips\.twitch\.tv\/|twitch\.tv\/\w+\/clip\/)([a-zA-Z0-9_-]+)/i
  const clipMatch = cleanUrl.match(clipRegex)
  if (clipMatch) {
    return {
      type: 'twitch',
      platform: 'twitch-clip',
      originalUrl: url,
      playableUrl: url,
      metadata: { clipId: clipMatch[1] },
    }
  }

  // Twitch VOD: twitch.tv/videos/123456789
  const vodRegex = /twitch\.tv\/videos\/(\d+)/i
  const vodMatch = cleanUrl.match(vodRegex)
  if (vodMatch) {
    return {
      type: 'twitch',
      platform: 'twitch-video',
      originalUrl: url,
      playableUrl: url,
      metadata: { videoId: vodMatch[1] },
    }
  }

  // Twitch live stream: twitch.tv/username
  const streamRegex = /twitch\.tv\/([a-zA-Z0-9_-]+)(?:\/|$)/i
  const streamMatch = cleanUrl.match(streamRegex)
  if (streamMatch && !cleanUrl.includes('/clip/') && !cleanUrl.includes('/videos/')) {
    return {
      type: 'twitch',
      platform: 'twitch-stream',
      originalUrl: url,
      playableUrl: url,
      metadata: { channelName: streamMatch[1] },
    }
  }

  return { type: 'twitch', originalUrl: url, playableUrl: url }
}

/**
 * Build a Twitch embed URL with the correct parent parameter.
 *
 * IMPORTANT: clips MUST use `clips.twitch.tv/embed?clip=<slug>` per Twitch docs.
 * Streams and VODs use `player.twitch.tv/?channel=` or `?video=v<id>`.
 * See https://dev.twitch.tv/docs/embed/video-and-clips/ for format spec.
 */
export function buildTwitchEmbedUrl(
  detection: URLDetectionResult,
  parent?: string,
): string | null {
  const hostname =
    parent || (typeof window !== 'undefined' ? window.location.hostname : '')
  if (!hostname) return null

  if (detection.platform === 'twitch-clip' && detection.metadata?.clipId) {
    const params = new URLSearchParams({
      clip: detection.metadata.clipId,
      parent: hostname,
    })
    return `https://clips.twitch.tv/embed?${params.toString()}`
  }

  const base = 'https://player.twitch.tv/'

  if (detection.platform === 'twitch-video' && detection.metadata?.videoId) {
    const params = new URLSearchParams({
      video: `v${detection.metadata.videoId}`,
      parent: hostname,
    })
    return `${base}?${params.toString()}`
  } else if (
    detection.platform === 'twitch-stream' &&
    detection.metadata?.channelName
  ) {
    const params = new URLSearchParams({
      channel: detection.metadata.channelName,
      parent: hostname,
    })
    return `${base}?${params.toString()}`
  }

  return null
}

export function getURLTypeDisplayName(result: URLDetectionResult): string {
  switch (result.type) {
    case 'twitch':
      switch (result.platform) {
        case 'twitch-clip': return 'Twitch Clip'
        case 'twitch-video': return 'Twitch VOD'
        case 'twitch-stream': return 'Twitch Stream'
        default: return 'Twitch'
      }
    case 'youtube': return 'YouTube'
    case 'hls': return 'HLS Stream'
    case 'dash': return 'DASH Stream'
    case 'mp4': return 'MP4 Video'
    default: return 'Unknown'
  }
}

export function getRecommendedEngine(result: URLDetectionResult): PlayerEngine {
  switch (result.type) {
    case 'twitch':
      // Clips are iframe-only — the JS SDK does not accept `clip`.
      return result.platform === 'twitch-clip' ? 'twitch-iframe' : 'twitch-sdk'
    case 'youtube':
      return 'reactplayer'
    case 'dash':
      return 'dashjs'
    case 'hls':
    case 'mp4':
      return 'videojs'
    default:
      return 'videojs'
  }
}

/**
 * Detect URL type color for badges in the SmartUrlInput.
 */
export function getSourceColor(result: URLDetectionResult): string {
  switch (result.type) {
    case 'twitch': return 'var(--accent-twitch)'
    case 'youtube': return 'var(--accent-youtube)'
    case 'hls':
    case 'dash': return 'var(--accent-hls)'
    default: return 'var(--text-muted)'
  }
}
