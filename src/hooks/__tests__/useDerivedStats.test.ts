import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDerivedStats } from '../useDerivedStats'
import type { TwitchClip, TwitchVideo, TwitchGame } from '../../types/twitch'

function makeClip(overrides: Partial<TwitchClip> = {}): TwitchClip {
  return {
    id: 'clip1',
    url: '',
    embed_url: '',
    broadcaster_id: '1',
    broadcaster_name: 'Streamer',
    creator_id: '100',
    creator_name: 'Clipper1',
    video_id: 'v1',
    game_id: 'g1',
    language: 'en',
    title: 'Clip',
    view_count: 100,
    created_at: '2025-01-01T00:00:00Z',
    thumbnail_url: '',
    duration: 30,
    vod_offset: 0,
    ...overrides,
  }
}

function makeVideo(overrides: Partial<TwitchVideo> = {}): TwitchVideo {
  return {
    id: 'v1',
    stream_id: 's1',
    user_id: '1',
    user_login: 'streamer',
    user_name: 'Streamer',
    title: 'Stream VOD',
    description: '',
    created_at: '2025-01-01T00:00:00Z',
    published_at: '2025-01-01T00:00:00Z',
    url: '',
    thumbnail_url: '',
    viewable: 'public',
    view_count: 500,
    language: 'en',
    type: 'archive',
    duration: '1h2m3s',
    ...overrides,
  }
}

describe('useDerivedStats', () => {
  const emptyInput = {
    clips: [] as TwitchClip[],
    videos: [] as TwitchVideo[],
    channelInfo: null,
    games: new Map<string, TwitchGame>(),
  }

  it('returns zeros for empty data', () => {
    const { result } = renderHook(() => useDerivedStats(emptyInput))
    expect(result.current.growth.clipViewVelocity).toBe(0)
    expect(result.current.growth.vodViewTrend).toBe(0)
    expect(result.current.growth.clipCreationRate).toBe(0)
    expect(result.current.diversity.uniqueGames).toBe(0)
    expect(result.current.clipEngagement.clipsPerStreamHour).toBe(0)
    expect(result.current.vodStats.totalVODs).toBe(0)
    expect(result.current.vodStats.totalHoursStreamed).toBe(0)
    expect(result.current.vodStats.mostWatchedVOD).toBeNull()
  })

  describe('VOD duration parsing', () => {
    it('parses "1h2m3s" correctly into hours', () => {
      const videos = [makeVideo({ duration: '1h2m3s', view_count: 100 })]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, videos }),
      )
      // 1 + 2/60 + 3/3600 = 1.034166...
      expect(result.current.vodStats.totalHoursStreamed).toBeCloseTo(1.0342, 3)
    })

    it('parses "30m" correctly', () => {
      const videos = [makeVideo({ duration: '30m', view_count: 100 })]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, videos }),
      )
      expect(result.current.vodStats.totalHoursStreamed).toBeCloseTo(0.5, 3)
    })

    it('parses "3h0m0s" correctly', () => {
      const videos = [makeVideo({ duration: '3h0m0s', view_count: 100 })]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, videos }),
      )
      expect(result.current.vodStats.totalHoursStreamed).toBeCloseTo(3.0, 3)
    })
  })

  describe('content diversity labels', () => {
    it('returns "One-trick" for 1 or 0 unique games', () => {
      const clips = [makeClip({ game_id: 'g1' })]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips }),
      )
      expect(result.current.diversity.diversityLabel).toBe('One-trick')
    })

    it('returns "Focused" for 2-3 unique games', () => {
      const clips = [
        makeClip({ id: '1', game_id: 'g1' }),
        makeClip({ id: '2', game_id: 'g2' }),
        makeClip({ id: '3', game_id: 'g3' }),
      ]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips }),
      )
      expect(result.current.diversity.diversityLabel).toBe('Focused')
    })

    it('returns "Variety" for 4-7 unique games', () => {
      const clips = Array.from({ length: 5 }, (_, i) =>
        makeClip({ id: `c${i}`, game_id: `g${i}` }),
      )
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips }),
      )
      expect(result.current.diversity.diversityLabel).toBe('Variety')
    })

    it('returns "Ultra-variety" for 8+ unique games', () => {
      const clips = Array.from({ length: 9 }, (_, i) =>
        makeClip({ id: `c${i}`, game_id: `g${i}` }),
      )
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips }),
      )
      expect(result.current.diversity.diversityLabel).toBe('Ultra-variety')
    })
  })

  describe('clip engagement', () => {
    it('calculates clips per stream hour', () => {
      const clips = [makeClip(), makeClip({ id: '2' })]
      // 2h stream = 2 clips / 2 hours = 1 clip/hour
      const videos = [makeVideo({ duration: '2h0m0s' })]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips, videos }),
      )
      expect(result.current.clipEngagement.clipsPerStreamHour).toBeCloseTo(1.0, 2)
    })

    it('returns 0 clips per stream hour when no VODs', () => {
      const clips = [makeClip()]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips }),
      )
      expect(result.current.clipEngagement.clipsPerStreamHour).toBe(0)
    })
  })

  describe('growth indicators', () => {
    it('calculates clipViewVelocity for recent clips', () => {
      const now = new Date()
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
      const clips = [
        makeClip({ id: '1', view_count: 1000, created_at: tenDaysAgo.toISOString() }),
        makeClip({ id: '2', view_count: 500, created_at: now.toISOString() }),
      ]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips }),
      )
      // Total views = 1500, day span = ~10 days, velocity = ~150/day
      expect(result.current.growth.clipViewVelocity).toBeGreaterThan(0)
    })

    it('returns 0 velocity when no recent clips', () => {
      // Clips older than 30 days
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      const clips = [makeClip({ created_at: oldDate })]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, clips }),
      )
      expect(result.current.growth.clipViewVelocity).toBe(0)
    })
  })

  describe('VOD stats', () => {
    it('calculates totalHoursStreamed and avgStreamLength', () => {
      const videos = [
        makeVideo({ id: 'v1', duration: '2h0m0s', view_count: 100 }),
        makeVideo({ id: 'v2', duration: '4h0m0s', view_count: 200 }),
      ]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, videos }),
      )
      expect(result.current.vodStats.totalVODs).toBe(2)
      expect(result.current.vodStats.totalHoursStreamed).toBeCloseTo(6.0, 2)
      expect(result.current.vodStats.avgStreamLength).toBeCloseTo(3.0, 2)
    })

    it('finds the most watched VOD', () => {
      const videos = [
        makeVideo({ id: 'v1', view_count: 100, duration: '1h0m0s' }),
        makeVideo({ id: 'v2', view_count: 999, duration: '1h0m0s' }),
        makeVideo({ id: 'v3', view_count: 50, duration: '1h0m0s' }),
      ]
      const { result } = renderHook(() =>
        useDerivedStats({ ...emptyInput, videos }),
      )
      expect(result.current.vodStats.mostWatchedVOD?.id).toBe('v2')
    })
  })
})
