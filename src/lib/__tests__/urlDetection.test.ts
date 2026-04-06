import { describe, it, expect } from 'vitest'
import {
  detectURLType,
  isTwitchURL,
  isYouTubeURL,
  buildTwitchEmbedUrl,
  getRecommendedEngine,
  getSourceColor,
  getURLTypeDisplayName,
} from '../urlDetection'

describe('detectURLType', () => {
  it('detects a Twitch stream URL', () => {
    const result = detectURLType('https://twitch.tv/shroud')
    expect(result.type).toBe('twitch')
    expect(result.platform).toBe('twitch-stream')
    expect(result.metadata?.channelName).toBe('shroud')
  })

  it('detects a Twitch clip URL via clips.twitch.tv', () => {
    const result = detectURLType('https://clips.twitch.tv/AwesomeClipSlug123')
    expect(result.type).toBe('twitch')
    expect(result.platform).toBe('twitch-clip')
    expect(result.metadata?.clipId).toBe('AwesomeClipSlug123')
  })

  it('detects a Twitch clip URL via twitch.tv/user/clip/Slug', () => {
    const result = detectURLType('https://twitch.tv/shroud/clip/CoolClipSlug')
    expect(result.type).toBe('twitch')
    expect(result.platform).toBe('twitch-clip')
    expect(result.metadata?.clipId).toBe('CoolClipSlug')
  })

  it('detects a Twitch VOD URL', () => {
    const result = detectURLType('https://twitch.tv/videos/123456789')
    expect(result.type).toBe('twitch')
    expect(result.platform).toBe('twitch-video')
    expect(result.metadata?.videoId).toBe('123456789')
  })

  it('detects a YouTube watch URL', () => {
    const result = detectURLType('https://youtube.com/watch?v=abc123')
    expect(result.type).toBe('youtube')
  })

  it('detects a YouTube short URL (youtu.be)', () => {
    const result = detectURLType('https://youtu.be/abc123')
    expect(result.type).toBe('youtube')
  })

  it('detects an HLS URL (.m3u8)', () => {
    const result = detectURLType('https://example.com/stream/playlist.m3u8')
    expect(result.type).toBe('hls')
  })

  it('detects a DASH URL (.mpd)', () => {
    const result = detectURLType('https://example.com/video/manifest.mpd')
    expect(result.type).toBe('dash')
  })

  it('detects an MP4 URL', () => {
    const result = detectURLType('https://example.com/video.mp4')
    expect(result.type).toBe('mp4')
  })

  it('returns unknown for plain text', () => {
    const result = detectURLType('just some random text')
    expect(result.type).toBe('unknown')
  })

  it('returns unknown for empty string', () => {
    const result = detectURLType('')
    expect(result.type).toBe('unknown')
  })

  it('returns unknown for null-ish input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = detectURLType(null as any)
    expect(result.type).toBe('unknown')
  })
})

describe('isTwitchURL', () => {
  it('returns true for twitch.tv URLs', () => {
    expect(isTwitchURL('https://twitch.tv/shroud')).toBe(true)
    expect(isTwitchURL('https://clips.twitch.tv/Slug')).toBe(true)
    expect(isTwitchURL('https://m.twitch.tv/shroud')).toBe(true)
  })

  it('returns false for non-Twitch URLs', () => {
    expect(isTwitchURL('https://youtube.com/watch?v=abc')).toBe(false)
    expect(isTwitchURL('hello world')).toBe(false)
  })
})

describe('isYouTubeURL', () => {
  it('returns true for YouTube URLs', () => {
    expect(isYouTubeURL('https://youtube.com/watch?v=abc')).toBe(true)
    expect(isYouTubeURL('https://youtu.be/abc123')).toBe(true)
    expect(isYouTubeURL('https://youtube.com/live/abc123')).toBe(true)
  })

  it('returns false for non-YouTube URLs', () => {
    expect(isYouTubeURL('https://twitch.tv/shroud')).toBe(false)
    expect(isYouTubeURL('random text')).toBe(false)
  })
})

describe('buildTwitchEmbedUrl', () => {
  it('builds correct embed URL for a clip', () => {
    const detection = detectURLType('https://clips.twitch.tv/MyClip')
    const embedUrl = buildTwitchEmbedUrl(detection, 'localhost')
    expect(embedUrl).toContain('https://player.twitch.tv/')
    expect(embedUrl).toContain('clip=MyClip')
    expect(embedUrl).toContain('parent=localhost')
  })

  it('builds correct embed URL for a video', () => {
    const detection = detectURLType('https://twitch.tv/videos/999')
    const embedUrl = buildTwitchEmbedUrl(detection, 'localhost')
    expect(embedUrl).toContain('video=v999')
    expect(embedUrl).toContain('parent=localhost')
  })

  it('builds correct embed URL for a stream', () => {
    const detection = detectURLType('https://twitch.tv/shroud')
    const embedUrl = buildTwitchEmbedUrl(detection, 'localhost')
    expect(embedUrl).toContain('channel=shroud')
    expect(embedUrl).toContain('parent=localhost')
  })

  it('returns null when detection has no platform metadata', () => {
    const detection = detectURLType('https://youtube.com/watch?v=abc')
    const embedUrl = buildTwitchEmbedUrl(detection, 'localhost')
    expect(embedUrl).toBeNull()
  })
})

describe('getRecommendedEngine', () => {
  it('returns twitch-sdk for twitch', () => {
    const result = detectURLType('https://twitch.tv/shroud')
    expect(getRecommendedEngine(result)).toBe('twitch-sdk')
  })

  it('returns reactplayer for youtube', () => {
    const result = detectURLType('https://youtube.com/watch?v=abc')
    expect(getRecommendedEngine(result)).toBe('reactplayer')
  })

  it('returns dashjs for dash', () => {
    const result = detectURLType('https://example.com/video.mpd')
    expect(getRecommendedEngine(result)).toBe('dashjs')
  })

  it('returns videojs for hls', () => {
    const result = detectURLType('https://example.com/stream.m3u8')
    expect(getRecommendedEngine(result)).toBe('videojs')
  })

  it('returns videojs for mp4', () => {
    const result = detectURLType('https://example.com/video.mp4')
    expect(getRecommendedEngine(result)).toBe('videojs')
  })

  it('returns videojs for unknown', () => {
    const result = detectURLType('random text')
    expect(getRecommendedEngine(result)).toBe('videojs')
  })
})

describe('getSourceColor', () => {
  it('returns twitch accent for twitch URLs', () => {
    const result = detectURLType('https://twitch.tv/shroud')
    expect(getSourceColor(result)).toBe('var(--accent-twitch)')
  })

  it('returns youtube accent for youtube URLs', () => {
    const result = detectURLType('https://youtube.com/watch?v=abc')
    expect(getSourceColor(result)).toBe('var(--accent-youtube)')
  })

  it('returns hls accent for hls URLs', () => {
    const result = detectURLType('https://example.com/stream.m3u8')
    expect(getSourceColor(result)).toBe('var(--accent-hls)')
  })

  it('returns hls accent for dash URLs', () => {
    const result = detectURLType('https://example.com/video.mpd')
    expect(getSourceColor(result)).toBe('var(--accent-hls)')
  })

  it('returns muted for unknown', () => {
    const result = detectURLType('random text')
    expect(getSourceColor(result)).toBe('var(--text-muted)')
  })
})

describe('getURLTypeDisplayName', () => {
  it('returns correct display names', () => {
    expect(getURLTypeDisplayName(detectURLType('https://clips.twitch.tv/Slug'))).toBe('Twitch Clip')
    expect(getURLTypeDisplayName(detectURLType('https://twitch.tv/videos/123'))).toBe('Twitch VOD')
    expect(getURLTypeDisplayName(detectURLType('https://twitch.tv/shroud'))).toBe('Twitch Stream')
    expect(getURLTypeDisplayName(detectURLType('https://youtube.com/watch?v=abc'))).toBe('YouTube')
    expect(getURLTypeDisplayName(detectURLType('https://example.com/s.m3u8'))).toBe('HLS Stream')
    expect(getURLTypeDisplayName(detectURLType('https://example.com/v.mpd'))).toBe('DASH Stream')
    expect(getURLTypeDisplayName(detectURLType('https://example.com/v.mp4'))).toBe('MP4 Video')
    expect(getURLTypeDisplayName(detectURLType('random'))).toBe('Unknown')
  })
})
