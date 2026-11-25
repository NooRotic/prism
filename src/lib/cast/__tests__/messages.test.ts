import { contentType, fromEntry, parseContext, parseLoadData, parseNow } from '../messages'

const NOW = { v: 1, type: 'now', id: 'abc123', name: 'News One', state: 'playing' }
const CONTEXT = { v: 1, type: 'context', favorites: ['a', 'b'] }
const LOAD = { v: 1, id: 'abc123', kind: 'hls', live: true, favorites: ['a'], group: 'News' }

describe('parseNow', () => {
  it('reads an object and a JSON string', () => {
    expect(parseNow(NOW)).toEqual(NOW)
    expect(parseNow(JSON.stringify(NOW))).toEqual(NOW)
  })

  it('reads a channel with no id', () => {
    expect(parseNow({ ...NOW, id: null })?.id).toBeNull()
  })

  it.each([
    ['another version', { ...NOW, v: 2 }],
    ['another type', { ...NOW, type: 'context' }],
    ['a bad id', { ...NOW, id: 'a b' }],
    ['an unknown state', { ...NOW, state: 'dancing' }],
    ['no name', { v: 1, type: 'now', id: 'a', state: 'idle' }],
    ['text that is not JSON', '{oops'],
    ['null', null],
    ['a list', [NOW]],
  ])('refuses %s', (_what, raw) => {
    expect(parseNow(raw)).toBeNull()
  })
})

describe('parseContext', () => {
  it('reads favorites, dropping bad and repeated ids', () => {
    expect(parseContext(CONTEXT)).toEqual(CONTEXT)
    expect(parseContext({ ...CONTEXT, favorites: ['a', 'x y', 5, 'a', 'b'] })?.favorites).toEqual(['a', 'b'])
  })

  it('keeps at most 1000', () => {
    const many = Array.from({ length: 1500 }, (_, i) => `s${i}`)
    expect(parseContext({ ...CONTEXT, favorites: many })?.favorites).toHaveLength(1000)
  })

  it.each([{ ...CONTEXT, v: 2 }, { ...CONTEXT, type: 'now' }, { v: 1, type: 'context' }, { ...CONTEXT, favorites: 'a' }, undefined])('refuses %j', (raw) => {
    expect(parseContext(raw)).toBeNull()
  })
})

describe('parseLoadData', () => {
  it('reads what a load carries', () => {
    expect(parseLoadData(LOAD)).toEqual(LOAD)
    expect(parseLoadData({ ...LOAD, id: null, group: null, kind: 'dash', live: false })).toEqual({ ...LOAD, id: null, group: null, kind: 'dash', live: false })
  })

  it.each([{ ...LOAD, v: 2 }, { ...LOAD, kind: 'mp4' }, { ...LOAD, live: 'yes' }, { ...LOAD, id: 'a b' }, { ...LOAD, group: 4 }, { ...LOAD, favorites: null }, null])('refuses %j', (raw) => {
    expect(parseLoadData(raw)).toBeNull()
  })
})

it('names the content types', () => {
  expect(contentType('hls')).toBe('application/x-mpegurl')
  expect(contentType('dash')).toBe('application/dash+xml')
})

it('makes a live stream of a listed one, with PRISM’s copy of its picture', () => {
  const entry = { id: 'a', name: 'A', groups: [0], country: null, logo: null, kind: 'dash' as const, pinned: false, state: 'working' as const, url: 'https://h.test/a.mpd' }
  expect(fromEntry(entry)).toEqual({ id: 'a', name: 'A', url: 'https://h.test/a.mpd', kind: 'dash', live: true, logo: null })
})
