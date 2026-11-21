import { beforeEach, describe, expect, it } from 'vitest'
import type { CatchupVideo } from '../catchup'
import { contextSearch, dedupeById, listIdFromUrl, parseContext, readQueueSnapshot, windowAround, writeQueueSnapshot, type ContextItem } from '../videoContext'

beforeEach(() => localStorage.clear())

const item = (n: number): ContextItem => ({ id: `id${n}`, title: `t${n}`, thumbnail: `u${n}` })
const items = Array.from({ length: 10 }, (_, i) => item(i))

describe('parseContext', () => {
  it('reads from=catchup', () => {
    expect(parseContext('?from=catchup')).toEqual({ kind: 'catchup' })
  })
  it('reads a playlist id, and lets it win over from=catchup', () => {
    expect(parseContext('?list=PLabcdefghij')).toEqual({ kind: 'playlist', listId: 'PLabcdefghij' })
    expect(parseContext('?from=catchup&list=PLabcdefghij')).toEqual({ kind: 'playlist', listId: 'PLabcdefghij' })
  })
  it('ignores nothing, junk and a malformed list id', () => {
    expect(parseContext('')).toBeNull()
    expect(parseContext('?from=elsewhere')).toBeNull()
    expect(parseContext('?list=a b')).toBeNull()
    expect(parseContext('?list=x')).toBeNull()
  })
})

describe('contextSearch', () => {
  it('writes the address part back', () => {
    expect(contextSearch({ kind: 'catchup' })).toBe('?from=catchup')
    expect(contextSearch({ kind: 'playlist', listId: 'PLabcdefghij' })).toBe('?list=PLabcdefghij')
    expect(contextSearch(null)).toBe('')
  })
})

describe('windowAround total', () => {
  it('uses a given total (a playlist longer than what is loaded)', () => {
    expect(windowAround(items, 'id5', 3, 6, 120)!.total).toBe(120)
  })
})

describe('windowAround', () => {
  it('shows what is behind and ahead in the middle', () => {
    const w = windowAround(items, 'id5', 3, 6)!
    expect(w.index).toBe(5)
    expect(w.current.id).toBe('id5')
    expect(w.total).toBe(10)
    expect(w.before.map((i) => i.id)).toEqual(['id2', 'id3', 'id4'])
    expect(w.after.map((i) => i.id)).toEqual(['id6', 'id7', 'id8', 'id9'])
    expect(w.prev?.id).toBe('id4')
    expect(w.next?.id).toBe('id6')
  })
  it('has no previous at the start and no next at the end', () => {
    const first = windowAround(items, 'id0')!
    expect(first.before).toEqual([])
    expect(first.prev).toBeNull()
    const last = windowAround(items, 'id9')!
    expect(last.after).toEqual([])
    expect(last.next).toBeNull()
  })
  it('is null when the video is not in the list', () => {
    expect(windowAround(items, 'nope')).toBeNull()
  })
})

describe('queue snapshot', () => {
  const video = (id: string): CatchupVideo => ({ id, title: `t-${id}`, channel: 'c', publishedAt: '', durationSec: 60, thumbnail: `u-${id}` })
  it('round-trips only what the strip needs', () => {
    writeQueueSnapshot([video('a'), video('b')])
    expect(readQueueSnapshot()).toEqual([
      { id: 'a', title: 't-a', thumbnail: 'u-a' },
      { id: 'b', title: 't-b', thumbnail: 'u-b' },
    ])
  })
  it('keeps at most 200', () => {
    writeQueueSnapshot(Array.from({ length: 250 }, (_, i) => video(`v${i}`)))
    expect(readQueueSnapshot()).toHaveLength(200)
  })
  it('skips entries that are not videos (null, numbers, no id) instead of crashing on them', () => {
    localStorage.setItem(
      'prism_catchup_queue',
      JSON.stringify([null, 3, 'x', { title: 'no id' }, { id: 7 }, { id: 'ok', title: 'fine', thumbnail: 'u' }, { id: 'half' }]),
    )
    expect(readQueueSnapshot()).toEqual([
      { id: 'ok', title: 'fine', thumbnail: 'u' },
      { id: 'half', title: '', thumbnail: '' },
    ])
  })
  it('keeps a video once when the saved queue lists it twice', () => {
    writeQueueSnapshot([video('a'), video('b'), video('a')])
    expect(readQueueSnapshot().map((i) => i.id)).toEqual(['a', 'b'])
  })
  it('reads corrupt or missing storage as empty', () => {
    expect(readQueueSnapshot()).toEqual([])
    localStorage.setItem('prism_catchup_queue', '{bad')
    expect(readQueueSnapshot()).toEqual([])
  })
})

describe('listIdFromUrl', () => {
  it('reads a playlist from a watch address', () => {
    expect(listIdFromUrl('https://www.youtube.com/watch?v=abc12345678&list=PLabcdefghij1234')).toBe('PLabcdefghij1234')
  })
  it('ignores Mixes, Watch Later, Liked and anything malformed', () => {
    expect(listIdFromUrl('https://www.youtube.com/watch?v=abc12345678&list=RDabc12345678')).toBeNull()
    expect(listIdFromUrl('https://www.youtube.com/watch?v=abc12345678&list=WL')).toBeNull()
    expect(listIdFromUrl('https://www.youtube.com/watch?v=abc12345678&list=LLabcdefghijkl')).toBeNull()
    expect(listIdFromUrl('not a url')).toBeNull()
    expect(listIdFromUrl('https://youtu.be/abc12345678')).toBeNull()
  })
})

describe('dedupeById', () => {
  it('keeps the first of each id, in order', () => {
    expect(dedupeById([item(1), item(2), item(1), item(3), item(2)]).map((i) => i.id)).toEqual(['id1', 'id2', 'id3'])
  })
})
