import { beforeEach, describe, expect, it } from 'vitest'
import type { CatchupVideo } from '../catchup'
import { contextSearch, parseContext, readQueueSnapshot, windowAround, writeQueueSnapshot, type ContextItem } from '../videoContext'

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
  it('reads corrupt or missing storage as empty', () => {
    expect(readQueueSnapshot()).toEqual([])
    localStorage.setItem('prism_catchup_queue', '{bad')
    expect(readQueueSnapshot()).toEqual([])
  })
})
