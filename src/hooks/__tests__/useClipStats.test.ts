import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useClipStats } from '../useClipStats'
import type { TwitchClip, TwitchGame } from '../../types/twitch'

function makeClip(overrides: Partial<TwitchClip> = {}): TwitchClip {
  return {
    id: 'clip1',
    url: 'https://clips.twitch.tv/clip1',
    embed_url: 'https://clips.twitch.tv/embed/clip1',
    broadcaster_id: '1',
    broadcaster_name: 'Streamer',
    creator_id: '100',
    creator_name: 'Clipper1',
    video_id: 'v1',
    game_id: 'g1',
    language: 'en',
    title: 'Cool clip',
    view_count: 100,
    created_at: '2025-01-01T00:00:00Z',
    thumbnail_url: 'https://example.com/thumb.jpg',
    duration: 30,
    vod_offset: 0,
    ...overrides,
  }
}

describe('useClipStats', () => {
  it('returns zeros for empty clips array', () => {
    const { result } = renderHook(() => useClipStats([], new Map()))
    expect(result.current.totalClips).toBe(0)
    expect(result.current.totalViews).toBe(0)
    expect(result.current.avgViewsPerClip).toBe(0)
    expect(result.current.topClips).toEqual([])
    expect(result.current.topClippers).toEqual([])
    expect(result.current.uniqueClippers).toBe(0)
    expect(result.current.gameBreakdown).toEqual([])
  })

  it('returns correct stats for a single clip', () => {
    const clips = [makeClip({ view_count: 500 })]
    const { result } = renderHook(() => useClipStats(clips, new Map()))
    expect(result.current.totalClips).toBe(1)
    expect(result.current.totalViews).toBe(500)
    expect(result.current.avgViewsPerClip).toBe(500)
    expect(result.current.topClips).toHaveLength(1)
    expect(result.current.uniqueClippers).toBe(1)
  })

  it('sorts topClips by view count descending', () => {
    const clips = [
      makeClip({ id: 'a', view_count: 50, creator_name: 'Alice' }),
      makeClip({ id: 'b', view_count: 200, creator_name: 'Bob' }),
      makeClip({ id: 'c', view_count: 100, creator_name: 'Charlie' }),
    ]
    const { result } = renderHook(() => useClipStats(clips, new Map()))
    expect(result.current.topClips[0].id).toBe('b')
    expect(result.current.topClips[1].id).toBe('c')
    expect(result.current.topClips[2].id).toBe('a')
  })

  it('aggregates topClippers correctly', () => {
    const clips = [
      makeClip({ id: '1', creator_name: 'Alice', view_count: 100 }),
      makeClip({ id: '2', creator_name: 'Alice', view_count: 200 }),
      makeClip({ id: '3', creator_name: 'Bob', view_count: 50 }),
    ]
    const { result } = renderHook(() => useClipStats(clips, new Map()))
    expect(result.current.uniqueClippers).toBe(2)

    const alice = result.current.topClippers.find((c) => c.name === 'Alice')
    expect(alice).toBeDefined()
    expect(alice!.count).toBe(2)
    expect(alice!.totalViews).toBe(300)

    // Alice has more clips, so she should be first
    expect(result.current.topClippers[0].name).toBe('Alice')
  })

  it('computes game breakdown with correct game names from map', () => {
    const games = new Map<string, TwitchGame>([
      ['g1', { id: 'g1', name: 'Valorant', box_art_url: '', igdb_id: '' }],
      ['g2', { id: 'g2', name: 'Minecraft', box_art_url: '', igdb_id: '' }],
    ])
    const clips = [
      makeClip({ id: '1', game_id: 'g1', view_count: 100 }),
      makeClip({ id: '2', game_id: 'g1', view_count: 200 }),
      makeClip({ id: '3', game_id: 'g2', view_count: 50 }),
    ]
    const { result } = renderHook(() => useClipStats(clips, games))
    expect(result.current.gameBreakdown).toHaveLength(2)
    // Sorted by clip count descending
    expect(result.current.gameBreakdown[0].gameName).toBe('Valorant')
    expect(result.current.gameBreakdown[0].clipCount).toBe(2)
    expect(result.current.gameBreakdown[0].totalViews).toBe(300)
    expect(result.current.gameBreakdown[1].gameName).toBe('Minecraft')
  })

  it('calculates avgViewsPerClip correctly', () => {
    const clips = [
      makeClip({ id: '1', view_count: 100 }),
      makeClip({ id: '2', view_count: 300 }),
    ]
    const { result } = renderHook(() => useClipStats(clips, new Map()))
    expect(result.current.avgViewsPerClip).toBe(200)
  })
})
