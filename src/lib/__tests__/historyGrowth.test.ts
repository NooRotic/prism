import type { HistoryRow } from '../historyApi'
import {
  ROLLING_TITLES,
  formatHistoryDate,
  formatTrackingSince,
  growthOver,
  isStale,
  seriesOf,
} from '../historyGrowth'

const DAY = 86_400_000

function row(date: string, over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    date,
    rank: null,
    minutesStreamed: null,
    avgViewers: null,
    maxViewers: null,
    hoursWatched: null,
    followersChange: null,
    followersTotal: null,
    ttStatus: 'ok',
    ...over,
  }
}

describe('seriesOf', () => {
  it('fills a missing date with null so a gap stays a gap', () => {
    const points = seriesOf([row('2026-11-10', { followersTotal: 100 }), row('2026-11-12', { followersTotal: 120 })], 'followersTotal')

    expect(points.map((p) => p.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
    expect(points.map((p) => p.value)).toEqual([100, null, 120])
    expect(points[1].at).toBe(Date.UTC(2026, 10, 11))
  })

  it('keeps the null a row itself carries', () => {
    const points = seriesOf([row('2026-11-10', { rank: 5 }), row('2026-11-11', { rank: null }), row('2026-11-12', { rank: 4 })], 'rank')

    expect(points.map((p) => p.value)).toEqual([5, null, 4])
  })

  it('picks the series by key', () => {
    const rows = [row('2026-11-12', { avgViewers: 10, maxViewers: 20, hoursWatched: 30, followersTotal: 40, rank: 50 })]

    expect(seriesOf(rows, 'avgViewers')[0].value).toBe(10)
    expect(seriesOf(rows, 'maxViewers')[0].value).toBe(20)
    expect(seriesOf(rows, 'hoursWatched')[0].value).toBe(30)
    expect(seriesOf(rows, 'followersTotal')[0].value).toBe(40)
    expect(seriesOf(rows, 'rank')[0].value).toBe(50)
  })

  it('sorts rows that arrive out of order and gives nothing for no rows', () => {
    const points = seriesOf([row('2026-11-12', { rank: 2 }), row('2026-11-11', { rank: 1 })], 'rank')

    expect(points.map((p) => p.date)).toEqual(['2026-11-11', '2026-11-12'])
    expect(seriesOf([], 'rank')).toEqual([])
  })

  it('crosses a month boundary day by day', () => {
    const points = seriesOf([row('2026-10-30', { rank: 1 }), row('2026-11-02', { rank: 2 })], 'rank')

    expect(points.map((p) => p.date)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(points[3].at - points[0].at).toBe(3 * DAY)
  })
})

describe('growthOver', () => {
  it('30 days is the latest minus the value 30 days earlier (100 to 130 gives 30)', () => {
    const rows = [row('2026-10-13', { followersTotal: 100 }), row('2026-11-12', { followersTotal: 130 })]

    expect(growthOver(rows, 'followersTotal', 30)).toEqual({ delta: 30, from: '2026-10-13', to: '2026-11-12' })
  })

  it('returns null when the history does not reach back that far', () => {
    const rows = [row('2026-11-05', { followersTotal: 100 }), row('2026-11-12', { followersTotal: 130 })]

    expect(growthOver(rows, 'followersTotal', 30)).toBeNull()
    expect(growthOver(rows, 'followersTotal', 90)).toBeNull()
    expect(growthOver(rows, 'followersTotal', 7)).toEqual({ delta: 30, from: '2026-11-05', to: '2026-11-12' })
  })

  it('uses the newest row at or before the target date when that exact day is missing', () => {
    const rows = [
      row('2026-10-10', { followersTotal: 50 }),
      row('2026-10-20', { followersTotal: 80 }),
      row('2026-11-12', { followersTotal: 130 }),
    ]

    expect(growthOver(rows, 'followersTotal', 30)).toEqual({ delta: 80, from: '2026-10-10', to: '2026-11-12' })
  })

  it('is negative for a rank that improved', () => {
    const rows = [row('2026-10-13', { rank: 500 }), row('2026-11-12', { rank: 450 })]

    expect(growthOver(rows, 'rank', 30)?.delta).toBe(-50)
  })

  it('skips rows with no value: the latest is the newest row that has one', () => {
    const rows = [
      row('2026-10-01', { followersTotal: 90 }),
      row('2026-10-13', { followersTotal: 100 }),
      row('2026-11-11', { followersTotal: 120 }),
      row('2026-11-12', { followersTotal: null }),
    ]

    expect(growthOver(rows, 'followersTotal', 30)).toEqual({ delta: 30, from: '2026-10-01', to: '2026-11-11' })
  })

  it('supports 7 and 90 days', () => {
    const rows = [row('2026-08-14', { followersTotal: 10 }), row('2026-11-05', { followersTotal: 90 }), row('2026-11-12', { followersTotal: 100 })]

    expect(growthOver(rows, 'followersTotal', 7)).toEqual({ delta: 10, from: '2026-11-05', to: '2026-11-12' })
    expect(growthOver(rows, 'followersTotal', 90)).toEqual({ delta: 90, from: '2026-08-14', to: '2026-11-12' })
  })

  it('is null for no rows, for a single row, and when no row has the value', () => {
    expect(growthOver([], 'rank', 7)).toBeNull()
    expect(growthOver([row('2026-11-12', { rank: 5 })], 'rank', 7)).toBeNull()
    expect(growthOver([row('2026-11-01'), row('2026-11-12')], 'rank', 7)).toBeNull()
  })
})

describe('isStale', () => {
  const updated = '2026-11-10T03:00:00Z'
  const exactly48h = Date.parse('2026-11-12T03:00:00Z')

  it('is false at exactly 48 hours and true just past it', () => {
    expect(isStale(updated, exactly48h)).toBe(false)
    expect(isStale(updated, exactly48h + 1)).toBe(true)
    expect(isStale(updated, exactly48h - DAY)).toBe(false)
  })

  it('is true for a missing or unreadable time', () => {
    expect(isStale(null, exactly48h)).toBe(true)
    expect(isStale('yesterday', exactly48h)).toBe(true)
  })
})

describe('dates and titles', () => {
  it('formats a UTC date as the same calendar day in any time zone', () => {
    expect(formatHistoryDate('2026-11-12')).toBe('Nov 12')
    expect(formatTrackingSince('2026-11-01')).toBe('Nov 1')
    expect(formatTrackingSince('2026-12-31')).toBe('Dec 31')
  })

  it('says the viewer and hours charts are rolling 30-day figures', () => {
    expect(ROLLING_TITLES.viewers).toBe('Average and peak viewers, rolling 30 days')
    expect(ROLLING_TITLES.hours).toBe('Hours watched, rolling 30 days')
  })
})
