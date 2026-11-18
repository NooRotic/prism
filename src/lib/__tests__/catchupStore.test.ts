import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSubscriptions,
  getWatchedSeeds,
  getWatchLater,
  readSLaneCache,
  recordWatched,
  setSubscriptions,
  setWatchLater,
  writeSLaneCache,
} from '../catchupStore'
import type { CatchupVideo } from '../catchup'

const vid = (id: string): CatchupVideo => ({ id, title: id, channel: 'c', publishedAt: '', durationSec: 60, thumbnail: '' })
const MIN = 60 * 1000

beforeEach(() => localStorage.clear())

describe('catchupStore', () => {
  it('round-trips subscriptions and Watch Later ids', () => {
    setSubscriptions([{ id: 'UCa', title: 'A' }])
    setWatchLater(['aaaaaaaaaaa'])
    expect(getSubscriptions()).toEqual([{ id: 'UCa', title: 'A' }])
    expect(getWatchLater()).toEqual(['aaaaaaaaaaa'])
  })

  it('treats corrupt JSON as empty', () => {
    localStorage.setItem('prism_catchup_subscriptions', '{nope')
    localStorage.setItem('prism_catchup_watch_later', '42')
    expect(getSubscriptions()).toEqual([])
    expect(getWatchLater()).toEqual([])
  })

  it('keeps the newest watched video first, without repeats, at most 10', () => {
    for (let i = 0; i < 12; i++) recordWatched(`video${String(i).padStart(6, '0')}`)
    recordWatched('video000005')
    const seeds = getWatchedSeeds(3)
    expect(seeds).toEqual(['video000005', 'video000011', 'video000010'])
    expect(getWatchedSeeds(99)).toHaveLength(10)
  })

  it('serves the subscription lane cache for 30 minutes', () => {
    writeSLaneCache([vid('a')], 0)
    expect(readSLaneCache(29 * MIN)).toEqual([vid('a')])
    expect(readSLaneCache(31 * MIN)).toBeNull()
  })

  it('empties the lane cache when the subscriptions change', () => {
    writeSLaneCache([vid('a')], 0)
    setSubscriptions([])
    expect(readSLaneCache(1)).toBeNull()
  })

  it('does not throw when storage refuses a write', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(() => setSubscriptions([{ id: 'UCa', title: 'A' }])).not.toThrow()
    expect(() => recordWatched('aaaaaaaaaaa')).not.toThrow()
    spy.mockRestore()
  })
})
