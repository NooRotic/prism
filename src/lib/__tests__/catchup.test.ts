import { describe, expect, it } from 'vitest'
import {
  blend,
  formatDuration,
  parseDuration,
  parseVideoId,
  parseVideoIds,
  uploadsPlaylistId,
  type CatchupVideo,
} from '../catchup'

const v = (id: string): CatchupVideo => ({
  id,
  title: id,
  channel: 'c',
  publishedAt: '',
  durationSec: 60,
  thumbnail: '',
})

describe('catchup parsing', () => {
  it('finds a video id in the common address shapes', () => {
    expect(parseVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('https://youtu.be/dQw4w9WgXcQ?t=5')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseVideoId('nope')).toBeNull()
  })

  it('dedupes a pasted block', () => {
    expect(parseVideoIds('dQw4w9WgXcQ\nhttps://youtu.be/dQw4w9WgXcQ, aaaaaaaaaaa')).toEqual(['dQw4w9WgXcQ', 'aaaaaaaaaaa'])
  })

  it('reads durations', () => {
    expect(parseDuration('PT1H2M3S')).toBe(3723)
    expect(parseDuration('PT45S')).toBe(45)
    expect(parseDuration('P0D')).toBe(0)
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatDuration(0)).toBe('live')
  })
})

describe('uploadsPlaylistId', () => {
  it('swaps the UC prefix for UU', () => {
    expect(uploadsPlaylistId('UCabcdefghijklmnopqrstuv')).toBe('UUabcdefghijklmnopqrstuv')
  })

  it('returns null for anything that is not a channel id', () => {
    expect(uploadsPlaylistId('nope')).toBeNull()
    expect(uploadsPlaylistId('UUabcdefghijklmnopqrstuv')).toBeNull()
  })
})

describe('catchup blend', () => {
  it('runs two subscriptions, one watch-later, one related, and skips a lane that runs dry', () => {
    const out = blend([v('s1'), v('s2'), v('s3'), v('s4')], [v('w1')], [v('r1'), v('r2')])
    expect(out.map((x) => x.id)).toEqual(['s1', 's2', 'w1', 'r1', 's3', 's4', 'r2'])
    expect(out.map((x) => x.tag).join('')).toBe('SSWRSSR')
  })

  it('never repeats a video that two lanes both found', () => {
    const out = blend([v('a'), v('b')], [v('a')], [v('b'), v('c')])
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })
})
