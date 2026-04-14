import { describe, it, expect } from 'vitest'
import { sortFollows } from '../useFollowedChannels'
import type { EnrichedFollow } from '../useFollowedChannels'

function makeFollow(
  name: string,
  opts: {
    isLive?: boolean
    viewerCount?: number
  } = {},
): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2026-01-01T00:00:00Z',
    isLive: opts.isLive ?? false,
    viewerCount: opts.viewerCount,
  }
}

describe('sortFollows', () => {
  describe('live-first (default)', () => {
    it('puts live channels before offline channels', () => {
      const input = [
        makeFollow('alpha'),
        makeFollow('beta', { isLive: true }),
        makeFollow('gamma'),
        makeFollow('delta', { isLive: true }),
      ]
      const sorted = sortFollows(input, 'live-first')
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'beta',
        'delta',
        'alpha',
        'gamma',
      ])
    })

    it('sorts alphabetically within each live/offline group', () => {
      const input = [
        makeFollow('zulu', { isLive: true }),
        makeFollow('alpha'),
        makeFollow('bravo', { isLive: true }),
        makeFollow('yankee'),
      ]
      const sorted = sortFollows(input, 'live-first')
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'bravo',
        'zulu',
        'alpha',
        'yankee',
      ])
    })

    it('handles all-live or all-offline sets', () => {
      const allLive = [
        makeFollow('charlie', { isLive: true }),
        makeFollow('alpha', { isLive: true }),
        makeFollow('bravo', { isLive: true }),
      ]
      expect(
        sortFollows(allLive, 'live-first').map((f) => f.broadcaster_name),
      ).toEqual(['alpha', 'bravo', 'charlie'])

      const allOffline = [
        makeFollow('charlie'),
        makeFollow('alpha'),
        makeFollow('bravo'),
      ]
      expect(
        sortFollows(allOffline, 'live-first').map((f) => f.broadcaster_name),
      ).toEqual(['alpha', 'bravo', 'charlie'])
    })

    it('is case-insensitive on broadcaster_name comparison', () => {
      const input = [
        makeFollow('Zebra'),
        makeFollow('apple'),
        makeFollow('Banana'),
      ]
      const sorted = sortFollows(input, 'live-first')
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'apple',
        'Banana',
        'Zebra',
      ])
    })
  })

  describe('alpha', () => {
    it('sorts alphabetically regardless of live state', () => {
      const input = [
        makeFollow('zulu', { isLive: true }),
        makeFollow('alpha'),
        makeFollow('bravo', { isLive: true }),
        makeFollow('yankee'),
      ]
      const sorted = sortFollows(input, 'alpha')
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'alpha',
        'bravo',
        'yankee',
        'zulu',
      ])
    })
  })

  describe('viewers', () => {
    it('sorts live channels by viewer count descending', () => {
      const input = [
        makeFollow('a', { isLive: true, viewerCount: 100 }),
        makeFollow('b', { isLive: true, viewerCount: 500 }),
        makeFollow('c', { isLive: true, viewerCount: 250 }),
      ]
      const sorted = sortFollows(input, 'viewers')
      expect(sorted.map((f) => f.broadcaster_name)).toEqual(['b', 'c', 'a'])
    })

    it('puts live channels before offline, live by viewers then offline alpha', () => {
      const input = [
        makeFollow('offline-b'),
        makeFollow('live-small', { isLive: true, viewerCount: 10 }),
        makeFollow('offline-a'),
        makeFollow('live-big', { isLive: true, viewerCount: 1000 }),
      ]
      const sorted = sortFollows(input, 'viewers')
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'live-big',
        'live-small',
        'offline-a',
        'offline-b',
      ])
    })

    it('treats missing viewerCount as 0 for live channels', () => {
      const input = [
        makeFollow('a', { isLive: true, viewerCount: 100 }),
        makeFollow('b', { isLive: true }),
        makeFollow('c', { isLive: true, viewerCount: 50 }),
      ]
      const sorted = sortFollows(input, 'viewers')
      expect(sorted.map((f) => f.broadcaster_name)).toEqual(['a', 'c', 'b'])
    })
  })

  it('does not mutate the input array', () => {
    const input = [
      makeFollow('zulu', { isLive: true }),
      makeFollow('alpha'),
    ]
    const before = [...input]
    sortFollows(input, 'alpha')
    expect(input).toEqual(before)
  })

  it('returns an empty array for an empty input', () => {
    expect(sortFollows([], 'live-first')).toEqual([])
    expect(sortFollows([], 'alpha')).toEqual([])
    expect(sortFollows([], 'viewers')).toEqual([])
  })
})
