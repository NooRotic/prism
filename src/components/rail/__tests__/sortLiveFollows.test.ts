import { sortNewestLiveFirst } from '../sortLiveFollows'
import type { EnrichedFollow } from '../../../lib/followsStore'

function live(name: string, startedAt?: string): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2026-01-01T00:00:00Z',
    isLive: true,
    startedAt,
  }
}

const names = (follows: EnrichedFollow[]) => follows.map((f) => f.broadcaster_name)

describe('sortNewestLiveFirst', () => {
  it('puts the channel that went live most recently first', () => {
    const sorted = sortNewestLiveFirst([
      live('old', '2026-11-05T08:00:00Z'),
      live('new', '2026-11-05T12:00:00Z'),
      live('mid', '2026-11-05T10:00:00Z'),
    ])
    expect(names(sorted)).toEqual(['new', 'mid', 'old'])
  })

  // The point of this order over a viewer-count one: it only changes when
  // somebody goes live or offline, not every time a viewer count moves.
  it('keeps the same order however the viewer counts move', () => {
    const quiet = { ...live('a', '2026-11-05T08:00:00Z'), viewerCount: 5 }
    const busy = { ...live('b', '2026-11-05T09:00:00Z'), viewerCount: 5000 }
    expect(names(sortNewestLiveFirst([quiet, busy]))).toEqual(['b', 'a'])
    expect(names(sortNewestLiveFirst([{ ...quiet, viewerCount: 9000 }, { ...busy, viewerCount: 1 }]))).toEqual(['b', 'a'])
  })

  it('keeps the incoming order for channels that went live at the same moment', () => {
    const sorted = sortNewestLiveFirst([
      live('first', '2026-11-05T10:00:00Z'),
      live('second', '2026-11-05T10:00:00Z'),
      live('third', '2026-11-05T10:00:00Z'),
    ])
    expect(names(sorted)).toEqual(['first', 'second', 'third'])
  })

  it('puts channels with no usable start time last, in their incoming order', () => {
    const sorted = sortNewestLiveFirst([
      live('unknown-1'),
      live('dated', '2026-11-05T10:00:00Z'),
      live('garbled', 'not a date'),
    ])
    expect(names(sorted)).toEqual(['dated', 'unknown-1', 'garbled'])
  })

  it('does not mutate its input', () => {
    const input = [live('old', '2026-11-05T08:00:00Z'), live('new', '2026-11-05T12:00:00Z')]
    const before = [...input]
    sortNewestLiveFirst(input)
    expect(input).toEqual(before)
  })

  it('returns an empty array for an empty input', () => {
    expect(sortNewestLiveFirst([])).toEqual([])
  })
})
