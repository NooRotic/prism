import { describe, expect, it } from 'vitest'
import type { AdminUsage } from '../adminApi'
import { changeVsYesterday, formatCount, formatUtc, toBuckets, weeklyTotals } from '../adminFormat'

const day = (date: string, total: number): AdminUsage['days'][number] => ({
  date,
  counts: { home: total, twitch: 0, youtube: 0, 'hls-dash': 0, 'chat-popout': 0, other: 0 },
})

describe('formatCount', () => {
  it('groups thousands', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1500)).toBe('1,500')
    expect(formatCount(1234567)).toBe('1,234,567')
  })
})

describe('changeVsYesterday', () => {
  it.each([
    [17, 5, '+12 vs yesterday'],
    [3, 6, '−3 vs yesterday'],
    [5, 5, 'same as yesterday'],
    [0, 0, 'same as yesterday'],
    [4, 0, '+4 vs yesterday'],
    [0, 1200, '−1,200 vs yesterday'],
  ])('%i today against %i yesterday reads "%s"', (today, yesterday, text) => {
    expect(changeVsYesterday(today, yesterday)).toBe(text)
  })
})

describe('weeklyTotals', () => {
  it('adds every section of every day into ISO weeks that start on Monday, in UTC', () => {
    const days = [
      day('2026-12-27', 1), // a Sunday: the week of Monday 2026-12-21
      day('2026-12-28', 2), // a Monday: a new week
      day('2027-01-03', 3), // the Sunday of that week, across the year end
      day('2027-01-04', 4), // the next Monday
    ]

    expect(weeklyTotals(days)).toEqual([
      { weekStart: '2026-12-21', total: 1 },
      { weekStart: '2026-12-28', total: 5 },
      { weekStart: '2027-01-04', total: 4 },
    ])
  })

  it('sums all six sections and returns nothing for no days', () => {
    const busy: AdminUsage['days'][number] = {
      date: '2026-11-12',
      counts: { home: 1, twitch: 2, youtube: 3, 'hls-dash': 4, 'chat-popout': 5, other: 6 },
    }

    expect(weeklyTotals([busy])).toEqual([{ weekStart: '2026-11-09', total: 21 }])
    expect(weeklyTotals([])).toEqual([])
  })
})

describe('toBuckets', () => {
  it('maps dated values to the chart buckets, keeping zeros', () => {
    expect(toBuckets([{ date: '2026-11-12', value: 5 }, { date: '2026-11-13', value: 0 }])).toEqual([
      { day: '2026-11-12', at: Date.parse('2026-11-12'), value: 5 },
      { day: '2026-11-13', at: Date.parse('2026-11-13'), value: 0 },
    ])
  })
})

describe('formatUtc', () => {
  it('shows a server time (UTC, with or without seconds) or an epoch as date, minutes and UTC', () => {
    expect(formatUtc('2026-11-12 04:00:00')).toBe('2026-11-12 04:00 UTC')
    expect(formatUtc(Date.UTC(2026, 10, 12, 3, 5, 59))).toBe('2026-11-12 03:05 UTC')
  })
})
