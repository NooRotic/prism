import {
  bucketFollowersByDay,
  bucketHoursByDay,
  coverageDays,
  localDayKey,
  recordingsCut,
  viewsPerBroadcast,
} from '../historyStats'
import type { TwitchVideo } from '../../types/twitch'

// Every time below is built from local-date constructors, so the tests mean the same thing in
// any timezone, including across a clock change inside the 30-day window.
const NOW = new Date(2026, 10, 11, 15, 30, 0).getTime()
const iso = (y: number, m: number, d: number, h = 12, min = 0, s = 0) =>
  new Date(y, m, d, h, min, s).toISOString()
const at = (y: number, m: number, d: number, h = 12, min = 0, s = 0) => new Date(y, m, d, h, min, s).getTime()

function video(overrides: Partial<TwitchVideo>): TwitchVideo {
  return {
    id: 'v',
    stream_id: 's',
    user_id: '1',
    user_login: 'streamer',
    user_name: 'Streamer',
    title: 'a stream',
    description: '',
    created_at: iso(2026, 10, 10),
    published_at: iso(2026, 10, 10),
    url: 'https://twitch.tv/videos/1',
    thumbnail_url: '',
    viewable: 'public',
    view_count: 0,
    language: 'en',
    type: 'archive',
    duration: '1h',
    ...overrides,
  }
}

function archive(created_at: string, duration = '1h', view_count = 0): TwitchVideo {
  return video({ created_at, duration, view_count })
}

function valueOn(buckets: { day: string; value: number | null }[], day: string): number | null | undefined {
  return buckets.find((b) => b.day === day)?.value
}

describe('localDayKey', () => {
  it('writes the local calendar day as YYYY-MM-DD with leading zeros', () => {
    expect(localDayKey(at(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDayKey(at(2026, 10, 11, 0, 0, 1))).toBe('2026-11-11')
  })
})

describe('bucketFollowersByDay', () => {
  it('gives 30 local days, oldest first, ending with today', () => {
    const buckets = bucketFollowersByDay([], NOW)

    expect(buckets).toHaveLength(30)
    expect(buckets[0].day).toBe('2026-10-13')
    expect(buckets[0].at).toBe(at(2026, 9, 13, 0))
    expect(buckets[29].day).toBe('2026-11-11')
    expect(buckets[29].at).toBe(at(2026, 10, 11, 0))
  })

  it('takes a day count', () => {
    const buckets = bucketFollowersByDay([], NOW, 7)

    expect(buckets.map((b) => b.day)).toEqual([
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
    ])
  })

  it('counts follows per local day and gives 0 for an empty day', () => {
    const buckets = bucketFollowersByDay(
      [iso(2026, 10, 11, 9), iso(2026, 10, 11, 14), iso(2026, 10, 10, 20), iso(2026, 10, 8, 1)],
      NOW,
    )

    expect(valueOn(buckets, '2026-11-11')).toBe(2)
    expect(valueOn(buckets, '2026-11-10')).toBe(1)
    expect(valueOn(buckets, '2026-11-09')).toBe(0)
    expect(valueOn(buckets, '2026-11-08')).toBe(1)
    expect(buckets.every((b) => b.value !== null)).toBe(true)
  })

  it('puts a follow just before and just after local midnight on different days', () => {
    const buckets = bucketFollowersByDay([iso(2026, 10, 10, 23, 59, 59), iso(2026, 10, 11, 0, 0, 1)], NOW)

    expect(valueOn(buckets, '2026-11-10')).toBe(1)
    expect(valueOn(buckets, '2026-11-11')).toBe(1)
  })

  it('leaves out follows outside the window, in the future, or with a date it cannot read', () => {
    const buckets = bucketFollowersByDay(
      [iso(2026, 9, 12, 23, 0), iso(2026, 10, 12, 1, 0), 'not a date', iso(2026, 10, 11, 10)],
      NOW,
    )

    expect(buckets.reduce((sum, b) => sum + (b.value ?? 0), 0)).toBe(1)
  })

  it('gives null, not 0, for days entirely before the span that was read', () => {
    const coveredFrom = at(2026, 10, 5, 18, 0)
    const buckets = bucketFollowersByDay([iso(2026, 10, 10, 9), iso(2026, 10, 5, 19)], NOW, 30, coveredFrom)

    expect(valueOn(buckets, '2026-11-04')).toBeNull()
    expect(valueOn(buckets, '2026-10-13')).toBeNull()
    // The day the read stopped on was only partly read, so it is counted, not blanked.
    expect(valueOn(buckets, '2026-11-05')).toBe(1)
    expect(valueOn(buckets, '2026-11-06')).toBe(0)
    expect(valueOn(buckets, '2026-11-10')).toBe(1)
  })

  it('treats a day that ends exactly where the read starts as entirely before it', () => {
    const buckets = bucketFollowersByDay([], NOW, 30, at(2026, 10, 6, 0, 0, 0))

    expect(valueOn(buckets, '2026-11-05')).toBeNull()
    expect(valueOn(buckets, '2026-11-06')).toBe(0)
  })
})

describe('bucketHoursByDay', () => {
  it('counts archives only', () => {
    const buckets = bucketHoursByDay(
      [
        archive(iso(2026, 10, 10), '2h'),
        video({ type: 'highlight', created_at: iso(2026, 10, 10), duration: '5h' }),
        video({ type: 'upload', created_at: iso(2026, 10, 10), duration: '7h' }),
      ],
      NOW,
    )

    expect(valueOn(buckets, '2026-11-10')).toBe(2)
  })

  it('sums the hours of every archive that started on a day', () => {
    const buckets = bucketHoursByDay(
      [archive(iso(2026, 10, 10, 9), '2h'), archive(iso(2026, 10, 10, 20), '1h30m')],
      NOW,
    )

    expect(valueOn(buckets, '2026-11-10')).toBeCloseTo(3.5, 10)
  })

  it('counts a broadcast that crosses midnight wholly for the day it started', () => {
    const buckets = bucketHoursByDay([archive(iso(2026, 10, 9, 23, 0), '3h')], NOW)

    expect(valueOn(buckets, '2026-11-09')).toBe(3)
    expect(valueOn(buckets, '2026-11-10')).toBe(0)
  })

  it('gives null for days before the oldest recording and 0 for later empty days', () => {
    const buckets = bucketHoursByDay([archive(iso(2026, 10, 5, 8), '2h'), archive(iso(2026, 10, 9), '1h')], NOW)

    expect(valueOn(buckets, '2026-11-04')).toBeNull()
    expect(valueOn(buckets, '2026-10-13')).toBeNull()
    expect(valueOn(buckets, '2026-11-05')).toBe(2)
    expect(valueOn(buckets, '2026-11-06')).toBe(0)
    expect(valueOn(buckets, '2026-11-11')).toBe(0)
  })

  it('gives null for every day when there are no archives', () => {
    expect(bucketHoursByDay([], NOW).every((b) => b.value === null)).toBe(true)
    expect(
      bucketHoursByDay([video({ type: 'highlight' })], NOW).every((b) => b.value === null),
    ).toBe(true)
  })

  it('gives numbers for every day when the oldest recording is older than the window', () => {
    const buckets = bucketHoursByDay([archive(iso(2026, 8, 1), '4h'), archive(iso(2026, 10, 10), '1h')], NOW)

    expect(buckets).toHaveLength(30)
    expect(buckets.every((b) => b.value !== null)).toBe(true)
    expect(valueOn(buckets, '2026-11-10')).toBe(1)
    expect(valueOn(buckets, '2026-10-13')).toBe(0)
  })

  it('takes a day count', () => {
    expect(bucketHoursByDay([archive(iso(2026, 10, 10))], NOW, 7)).toHaveLength(7)
  })

  it('ignores an archive whose date it cannot read', () => {
    const buckets = bucketHoursByDay([archive('not a date', '9h')], NOW)

    expect(buckets.every((b) => b.value === null)).toBe(true)
  })
})

describe('viewsPerBroadcast', () => {
  it('keeps archives inside the 30-day window only', () => {
    const points = viewsPerBroadcast(
      [
        archive(iso(2026, 10, 10), '1h', 40),
        archive(iso(2026, 9, 12, 23, 0), '1h', 99), // the day before the first day of the window
        video({ type: 'highlight', created_at: iso(2026, 10, 9), view_count: 77 }),
      ],
      NOW,
    )

    expect(points).toEqual([{ at: at(2026, 10, 10), value: 40 }])
  })

  it('includes an archive from the first moment of the window', () => {
    const points = viewsPerBroadcast([archive(iso(2026, 9, 13, 0, 0, 0), '1h', 5)], NOW)

    expect(points).toEqual([{ at: at(2026, 9, 13, 0, 0, 0), value: 5 }])
  })

  it('orders the points oldest first, whatever order the videos came in', () => {
    const points = viewsPerBroadcast(
      [archive(iso(2026, 10, 10), '1h', 3), archive(iso(2026, 10, 2), '1h', 1), archive(iso(2026, 10, 6), '1h', 2)],
      NOW,
    )

    expect(points.map((p) => p.value)).toEqual([1, 2, 3])
  })

  it('keeps two broadcasts on one day as two points', () => {
    const points = viewsPerBroadcast([archive(iso(2026, 10, 10, 9), '1h', 4), archive(iso(2026, 10, 10, 21), '1h', 8)], NOW)

    expect(points).toEqual([
      { at: at(2026, 10, 10, 9), value: 4 },
      { at: at(2026, 10, 10, 21), value: 8 },
    ])
  })

  it('gives nothing for no recordings', () => {
    expect(viewsPerBroadcast([], NOW)).toEqual([])
  })
})

describe('coverageDays', () => {
  it('counts whole days from the oldest recording to now', () => {
    const days = coverageDays(
      [archive(iso(2026, 10, 10)), archive(iso(2026, 10, 2, 12, 0), '1h'), archive(iso(2026, 10, 6))],
      NOW,
    )

    // Nov 2 12:00 to Nov 11 15:30 is 9 days and 3.5 hours.
    expect(days).toBe(9)
  })

  it('is null with no recordings', () => {
    expect(coverageDays([], NOW)).toBeNull()
    expect(coverageDays([video({ type: 'upload' })], NOW)).toBeNull()
  })

  it('is never negative', () => {
    expect(coverageDays([archive(iso(2026, 10, 12, 8))], NOW)).toBe(0)
  })
})

describe('bucketHoursByDay when the oldest day was only partly read', () => {
  it('gives null for the oldest recording’s own day as well as the days before it', () => {
    const videos = [archive(iso(2026, 10, 5, 8), '2h'), archive(iso(2026, 10, 9), '1h')]

    const buckets = bucketHoursByDay(videos, NOW, 30, true)

    expect(valueOn(buckets, '2026-11-04')).toBeNull()
    expect(valueOn(buckets, '2026-11-05')).toBeNull()
    expect(valueOn(buckets, '2026-11-06')).toBe(0)
    expect(valueOn(buckets, '2026-11-09')).toBe(1)
  })

  it('counts the oldest day as usual when the read was complete', () => {
    const videos = [archive(iso(2026, 10, 5, 8), '2h')]

    expect(valueOn(bucketHoursByDay(videos, NOW, 30, false), '2026-11-05')).toBe(2)
    expect(valueOn(bucketHoursByDay(videos, NOW), '2026-11-05')).toBe(2)
  })

  it('stays all null with no recordings, partly read or not', () => {
    expect(bucketHoursByDay([], NOW, 30, true).every((b) => b.value === null)).toBe(true)
  })
})

// A read that filled its page and did not reach back past the start of the 30 days was cut by the
// page limit, not by how long Twitch keeps recordings, so days before it are unknown, not empty.
describe('recordingsCut', () => {
  const many = (count: number, firstDaysAgo: number, stepDays: number) =>
    Array.from({ length: count }, (_, i) => archive(new Date(NOW - (firstDaysAgo + i * stepDays) * 86_400_000).toISOString()))

  it('is true when the page is full and its oldest recording is inside the 30 days', () => {
    expect(recordingsCut(many(100, 0.1, 0.2), NOW, 100)).toBe(true)
  })

  it('is false when the page is not full', () => {
    expect(recordingsCut(many(99, 0.1, 0.2), NOW, 100)).toBe(false)
  })

  it('is false when a full page reaches back past the start of the 30 days', () => {
    expect(recordingsCut(many(100, 0.1, 0.5), NOW, 100)).toBe(false)
  })

  it('counts archives only', () => {
    const videos = [...many(60, 0.1, 0.2), ...Array.from({ length: 60 }, () => video({ type: 'highlight' }))]

    expect(recordingsCut(videos, NOW, 100)).toBe(false)
  })

  it('is false with no recordings', () => {
    expect(recordingsCut([], NOW, 100)).toBe(false)
  })

  it('takes a day count', () => {
    expect(recordingsCut(many(100, 0.1, 0.2), NOW, 100, 10)).toBe(false)
  })
})
