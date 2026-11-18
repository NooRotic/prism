import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatchupVideo } from '../catchup'

vi.mock('../catchupApi', () => ({
  describeVideos: vi.fn(async (ids: string[]): Promise<CatchupVideo[]> =>
    ids.map((id) => ({ id, title: id, channel: 'c', publishedAt: '', durationSec: 60, thumbnail: '' })),
  ),
}))

import { describeVideos } from '../catchupApi'
import { fetchMixIds, fetchRelatedLane } from '../mixRelated'

const ids = (n: number, prefix = 'v') => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(10, '0')}`.slice(0, 11))

/** Fake IFrame API. `answers[list]` is what getPlaylist() reports once `after` polls have passed; absent = never. */
let answers: Record<string, { after: number; list: string[] }>
let destroyed: number
let cued: string[]

class FakePlayer {
  private polls = 0
  private list = ''
  constructor(_el: HTMLElement, o: { events?: { onReady?: () => void } }) {
    queueMicrotask(() => o.events?.onReady?.())
  }
  mute() {}
  cuePlaylist(o: { list?: string }) {
    this.list = o.list ?? ''
    cued.push(this.list)
  }
  getPlaylist() {
    const a = answers[this.list]
    this.polls++
    return a && this.polls > a.after ? a.list : null
  }
  destroy() {
    destroyed++
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  answers = {}
  destroyed = 0
  cued = []
  ;(window as unknown as { YT: unknown }).YT = { Player: FakePlayer }
})
afterEach(() => {
  vi.useRealTimers()
  delete (window as unknown as { YT?: unknown }).YT
  document.body.innerHTML = ''
})

describe('fetchMixIds', () => {
  it('returns the Mix ids without the seed, then removes the hidden player', async () => {
    const seed = 'seedvideo01'
    answers[`RD${seed}`] = { after: 2, list: [seed, ...ids(60)] }
    const p = fetchMixIds(seed)
    await vi.advanceTimersByTimeAsync(2000)
    const out = await p
    expect(out).toHaveLength(60)
    expect(out).not.toContain(seed)
    expect(cued).toEqual([`RD${seed}`])
    expect(destroyed).toBe(1)
    expect(document.body.children).toHaveLength(0)
  })

  it('gives up with an empty list after the timeout and still cleans up', async () => {
    const p = fetchMixIds('seedvideo01', 8000)
    await vi.advanceTimersByTimeAsync(8100)
    expect(await p).toEqual([])
    expect(destroyed).toBe(1)
    expect(document.body.children).toHaveLength(0)
  })
})

describe('fetchRelatedLane', () => {
  it('moves on to the next seed when the first Mix gives nothing, and describes up to 50 ids', async () => {
    answers['RDsecondseed1'] = { after: 0, list: ids(80) }
    const run = fetchRelatedLane(['firstseed01', 'secondseed1'])
    await vi.advanceTimersByTimeAsync(12000)
    const lane = await run
    expect(lane).toHaveLength(50)
    expect(vi.mocked(describeVideos).mock.calls.at(-1)![0]).toHaveLength(50)
  })

  it('returns an empty lane when no seed answers', async () => {
    const run = fetchRelatedLane(['firstseed01'])
    await vi.advanceTimersByTimeAsync(9000)
    expect(await run).toEqual([])
  })

  it('returns an empty lane for no seeds without touching the player', async () => {
    expect(await fetchRelatedLane([])).toEqual([])
    expect(cued).toEqual([])
  })
})

describe('fetchMixIds when the IFrame API never finishes loading', () => {
  it('gives up with [] inside the same time budget instead of waiting forever', async () => {
    delete (window as unknown as { YT?: unknown }).YT
    const p = fetchMixIds('seedvideo01', 3000)
    await vi.advanceTimersByTimeAsync(3100)
    expect(await p).toEqual([])
  })
})
