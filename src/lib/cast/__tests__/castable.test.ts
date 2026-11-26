import { resolveStreamSource, type StreamSource } from '../../streamSource'
import type { StreamEntry } from '../../streamsApi'
import { castReason, toCastStream } from '../castable'

const pasted = (url: string, as?: string): StreamSource => {
  const params = new URLSearchParams({ url, ...(as ? { as } : {}) })
  return resolveStreamSource('custom', params) as StreamSource
}
const ENTRY: StreamEntry = { id: 'abc', name: 'News One', groups: [], country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: 'https://h.test/a.m3u8' }

describe('castReason', () => {
  it('is nothing for HLS and DASH over https', () => {
    expect(castReason(pasted('https://h.test/a.m3u8'))).toBeNull()
    expect(castReason(pasted('https://h.test/a.mpd'))).toBeNull()
    expect(castReason(pasted('HTTPS://h.test/a.m3u8'))).toBeNull()
  })

  it('says why another kind, or a plain http address, cannot go to the TV', () => {
    expect(castReason(pasted('https://h.test/a.mp4'))).toBe('Only HLS and DASH streams can be cast')
    expect(castReason(pasted('http://h.test/a.m3u8'))).toBe('This address is not secure (https), so a TV cannot play it')
  })
})

describe('toCastStream', () => {
  it('is a listed stream with its id and name, live', () => {
    expect(toCastStream(pasted('https://h.test/a.m3u8'), ENTRY, true)).toEqual({ id: 'abc', name: 'News One', url: 'https://h.test/a.m3u8', kind: 'hls', live: true, logo: null })
  })

  it('names a pasted address by its host only, live unless its length is known', () => {
    const source = pasted('https://h.test/a.mpd?token=secret')
    expect(toCastStream(source, null, false)).toEqual({ id: null, name: 'h.test', url: source.url, kind: 'dash', live: true, logo: null })
    expect(toCastStream(source, null, true).live).toBe(false)
  })

  it('knows a built-in demo is a recording, listed or not', () => {
    const demo = resolveStreamSource('bbb-hls', new URLSearchParams()) as StreamSource
    expect(toCastStream(demo, null, false)).toMatchObject({ id: null, name: 'Big Buck Bunny', live: false })
    expect(toCastStream(demo, { ...ENTRY, url: demo.url }, false)).toMatchObject({ id: 'abc', live: false })
  })
})
