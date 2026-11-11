import {
  JUST_WENT_LIVE_MS,
  compactCount,
  computeFollowStats,
  formatCompactDuration,
  groupCategories,
  mostWatched,
  recentlyStarted,
} from '../dashboardStats'
import type { EnrichedFollow } from '../followsStore'

const NOW = Date.parse('2026-11-11T12:00:00Z')
const MIN = 60_000

function live(
  name: string,
  minutesAgo: number | null,
  overrides: Partial<EnrichedFollow> = {},
): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2022-06-01T00:00:00Z',
    isLive: true,
    viewerCount: 10,
    gameName: 'Just Chatting',
    language: 'en',
    startedAt: minutesAgo === null ? undefined : new Date(NOW - minutesAgo * MIN).toISOString(),
    ...overrides,
  }
}

function offline(name: string, overrides: Partial<EnrichedFollow> = {}): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2015-01-01T00:00:00Z',
    isLive: false,
    ...overrides,
  }
}

describe('formatCompactDuration', () => {
  it.each([
    [4 * MIN, '4m'],
    [65 * MIN, '1h 05m'],
    [4 * 60 * MIN, '4h'],
    [160 * MIN, '2h 40m'],
    [0, '0m'],
    [-5 * MIN, '0m'],
  ])('formats %i ms as %s', (ms, text) => {
    expect(formatCompactDuration(ms)).toBe(text)
  })
})

describe('compactCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1k'],
    [1234, '1.2k'],
    [8100, '8.1k'],
    [12345, '12.3k'],
    [999_999, '1M'],
    [1_250_000, '1.3M'],
  ])('formats %i as %s', (n, text) => {
    expect(compactCount(n)).toBe(text)
  })
})

describe('computeFollowStats', () => {
  it('counts only live follows for live figures and reports the loaded count', () => {
    const stats = computeFollowStats(
      [live('A', 10, { viewerCount: 100 }), live('B', 20, { viewerCount: 50 }), offline('C'), offline('D')],
      NOW,
    )

    expect(stats.liveCount).toBe(2)
    expect(stats.loadedCount).toBe(4)
    expect(stats.watching).toBe(150)
  })

  it('takes the median uptime of live follows, averaging the middle two when even', () => {
    expect(computeFollowStats([live('A', 10), live('B', 30), live('C', 100)], NOW).typicalUptimeMs).toBe(30 * MIN)
    expect(computeFollowStats([live('A', 10), live('B', 30)], NOW).typicalUptimeMs).toBe(20 * MIN)
  })

  it('has no typical uptime, longest or oldest with nobody live', () => {
    const stats = computeFollowStats([offline('A')], NOW)

    expect(stats.typicalUptimeMs).toBeNull()
    expect(stats.longest).toBeNull()
    expect(stats.oldestLive).toBeNull()
    expect(stats.languages).toEqual([])
    expect(stats.justWentLive).toBe(0)
  })

  it('counts a follow that started exactly 30 minutes ago as just gone live, and 31 minutes ago as not', () => {
    expect(JUST_WENT_LIVE_MS).toBe(30 * MIN)
    expect(computeFollowStats([live('A', 30)], NOW).justWentLive).toBe(1)
    expect(computeFollowStats([live('A', 31)], NOW).justWentLive).toBe(0)
    expect(computeFollowStats([live('A', 1), live('B', 29), live('C', 90)], NOW).justWentLive).toBe(2)
  })

  it('reports the longest current uptime with whose it is', () => {
    const stats = computeFollowStats([live('Short', 5), live('Long', 318), live('Mid', 60)], NOW)

    expect(stats.longest).toEqual({ name: 'Long', ms: 318 * MIN })
  })

  it('counts languages across live follows, most common first then by code', () => {
    const stats = computeFollowStats(
      [
        live('A', 1, { language: 'en' }),
        live('B', 1, { language: 'de' }),
        live('C', 1, { language: 'en' }),
        live('D', 1, { language: 'fr' }),
        live('E', 1, { language: undefined }),
        offline('F', { language: 'es' }),
      ],
      NOW,
    )

    expect(stats.languages).toEqual([
      { language: 'en', count: 2 },
      { language: 'de', count: 1 },
      { language: 'fr', count: 1 },
    ])
  })

  it('names the live follow with the earliest follow date and its year', () => {
    const stats = computeFollowStats(
      [
        live('New', 1, { followed_at: '2024-03-01T00:00:00Z' }),
        live('Old', 1, { followed_at: '2019-07-15T12:00:00Z' }),
        offline('Older', { followed_at: '2012-01-01T00:00:00Z' }),
      ],
      NOW,
    )

    expect(stats.oldestLive).toEqual({ name: 'Old', year: 2019 })
  })

  it('keeps a live follow with an unreadable start time in the counts but out of the uptime figures', () => {
    const stats = computeFollowStats(
      [live('NoStart', null, { viewerCount: 70 }), live('Bad', 5, { startedAt: 'not a date', viewerCount: 30 }), live('Fine', 40)],
      NOW,
    )

    expect(stats.liveCount).toBe(3)
    expect(stats.watching).toBe(70 + 30 + 10)
    expect(stats.typicalUptimeMs).toBe(40 * MIN)
    expect(stats.longest).toEqual({ name: 'Fine', ms: 40 * MIN })
  })
})

describe('groupCategories', () => {
  it('groups live follows by category, most viewers first, ignoring offline follows', () => {
    const rows = groupCategories([
      live('A', 1, { gameName: 'Valorant', viewerCount: 300 }),
      live('B', 1, { gameName: 'Just Chatting', viewerCount: 100 }),
      live('C', 1, { gameName: 'Just Chatting', viewerCount: 250 }),
      live('D', 1, { gameName: 'Elden Ring', viewerCount: 500 }),
      offline('E', { gameName: 'Minecraft' }),
    ])

    expect(rows).toEqual([
      { name: 'Elden Ring', liveCount: 1, viewers: 500 },
      { name: 'Just Chatting', liveCount: 2, viewers: 350 },
      { name: 'Valorant', liveCount: 1, viewers: 300 },
    ])
  })

  it('breaks viewer ties by name and files a missing category under No category', () => {
    const rows = groupCategories([
      live('A', 1, { gameName: 'Zelda', viewerCount: 10 }),
      live('B', 1, { gameName: 'Apex', viewerCount: 10 }),
      live('C', 1, { gameName: '', viewerCount: 3 }),
      live('D', 1, { gameName: undefined, viewerCount: 4 }),
    ])

    expect(rows.map((r) => r.name)).toEqual(['Apex', 'Zelda', 'No category'])
    expect(rows[2]).toEqual({ name: 'No category', liveCount: 2, viewers: 7 })
  })
})

describe('recentlyStarted and mostWatched', () => {
  const follows = [
    live('Old', 300, { viewerCount: 900 }),
    live('Newest', 2, { viewerCount: 5 }),
    live('Mid', 50, { viewerCount: 400 }),
    live('Newer', 10, { viewerCount: 200 }),
    live('Big', 120, { viewerCount: 1500 }),
    offline('Gone', { viewerCount: 99999 }),
  ]

  it('lists the three most recently started live follows whatever their uptime', () => {
    expect(recentlyStarted(follows).map((f) => f.broadcaster_name)).toEqual(['Newest', 'Newer', 'Mid'])
  })

  it('lists the three most watched live follows', () => {
    expect(mostWatched(follows).map((f) => f.broadcaster_name)).toEqual(['Big', 'Old', 'Mid'])
  })

  it('honours the limit and does not change the input', () => {
    const copy = [...follows]

    expect(recentlyStarted(follows, 1)).toHaveLength(1)
    expect(mostWatched(follows, 2)).toHaveLength(2)
    expect(follows).toEqual(copy)
  })
})
