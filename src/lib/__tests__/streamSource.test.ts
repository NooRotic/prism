import { describe, it, expect } from 'vitest'
import { resolveSnapshotStream, resolveStreamSource, toStreamAddress } from '../streamSource'
import { demoToEntry, getDemoById, getHlsDashDemo } from '../../config/demoContent'
import type { StreamEntry, StreamSnapshot } from '../streamsApi'

const params = (query: string) => new URLSearchParams(query)

function entry(over: Partial<StreamEntry> = {}): StreamEntry {
  return {
    id: '0123456789ab',
    name: 'Alpha',
    groups: [0],
    country: 'us',
    logo: null,
    kind: 'hls',
    pinned: false,
    state: 'new',
    url: 'https://a.test/live/playlist',
    ...over,
  }
}

function snapshot(streams: StreamEntry[]): StreamSnapshot {
  return { generated: '2026-11-14T05:00:00Z', defaultId: null, groups: ['Other'], streams }
}

describe('resolveSnapshotStream', () => {
  it('turns a public id in the snapshot into a source for that stream address', () => {
    const source = resolveSnapshotStream('0123456789ab', snapshot([entry()]))

    expect(source?.url).toBe('https://a.test/live/playlist')
    expect(source?.kind).toBe('hls')
    expect(source?.detection.type).toBe('hls')
    expect(source?.detection.playableUrl).toBe('https://a.test/live/playlist')
    expect(source?.guessedKind).toBe(false)
  })

  it('takes the kind from the entry, whatever the address looks like', () => {
    const dash = resolveSnapshotStream('0123456789ab', snapshot([entry({ kind: 'dash', url: 'https://a.test/live/manifest' })]))

    expect(dash?.kind).toBe('dash')
    expect(dash?.detection.type).toBe('dash')
    expect(dash?.guessedKind).toBe(false)
    // An address that names its own type does not argue with the entry.
    expect(resolveSnapshotStream('0123456789ab', snapshot([entry({ kind: 'hls', url: 'https://a.test/x.mpd' })]))?.kind).toBe('hls')
  })

  it('finds the right entry among many', () => {
    const list = snapshot([entry({ id: 'aaaaaaaaaaaa', url: 'https://a.test/1' }), entry({ id: 'bbbbbbbbbbbb', url: 'https://a.test/2' })])

    expect(resolveSnapshotStream('bbbbbbbbbbbb', list)?.url).toBe('https://a.test/2')
  })

  it('gives null for an id that is not in the snapshot, no id, and no snapshot', () => {
    expect(resolveSnapshotStream('ffffffffffff', snapshot([entry()]))).toBeNull()
    expect(resolveSnapshotStream(undefined, snapshot([entry()]))).toBeNull()
    expect(resolveSnapshotStream('', snapshot([entry()]))).toBeNull()
    expect(resolveSnapshotStream('0123456789ab', null)).toBeNull()
  })

  it.each([
    ['a javascript: address', 'javascript:alert(1)'],
    ['an ftp address', 'ftp://a.test/x'],
    ['a relative address', '/live/a.m3u8'],
    ['a data: address', 'data:text/plain,hi'],
    ['nothing', ''],
  ])('refuses an entry with %s', (_label, url) => {
    expect(resolveSnapshotStream('0123456789ab', snapshot([entry({ url })]))).toBeNull()
  })

  it('refuses an entry whose address is a Twitch or YouTube page, which this player cannot play', () => {
    expect(resolveSnapshotStream('0123456789ab', snapshot([entry({ url: 'https://twitch.tv/xqc' })]))).toBeNull()
    expect(resolveSnapshotStream('0123456789ab', snapshot([entry({ url: 'https://youtube.com/watch?v=abc' })]))).toBeNull()
  })
})

describe('demoToEntry', () => {
  it('describes a demo stream as a list entry: pinned, working, in the Demo group, no logo or country', () => {
    const demo = getDemoById('bbb-hls')!

    expect(demoToEntry(demo)).toEqual({
      id: 'bbb-hls',
      name: 'Big Buck Bunny',
      groups: [0],
      country: null,
      logo: null,
      kind: 'hls',
      pinned: true,
      state: 'working',
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    })
  })

  it('keeps DASH demos DASH', () => {
    expect(demoToEntry(getDemoById('dash-bbb')!).kind).toBe('dash')
  })

  it('gives one entry for each HLS and DASH demo, and the demo id still resolves to a source', () => {
    const entries = getHlsDashDemo().map(demoToEntry)

    expect(entries.map((e) => e.id)).toEqual(getHlsDashDemo().map((d) => d.id))
    for (const e of entries) {
      expect(resolveStreamSource(e.id, params(''))?.url).toBe(e.url)
    }
  })
})

describe('resolveStreamSource', () => {
  it('uses the url of an HLS demo entry', () => {
    const source = resolveStreamSource('apple-basic', params(''))
    expect(source?.url).toBe(
      'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    )
    expect(source?.detection.type).toBe('hls')
    expect(source?.kind).toBe('hls')
    expect(source?.guessedKind).toBe(false)
  })

  it('knows a DASH demo entry', () => {
    expect(resolveStreamSource('dash-bbb', params(''))?.kind).toBe('dash')
  })

  it('treats a Twitch demo id as not a stream', () => {
    expect(resolveStreamSource('hasanabi', params(''))).toBeNull()
  })

  it('gives null for an unknown id with no url', () => {
    expect(resolveStreamSource('does-not-exist', params(''))).toBeNull()
  })

  it('lets a demo id win over the url query', () => {
    const source = resolveStreamSource('apple-basic', params('url=https%3A%2F%2Fh%2Fother.m3u8'))
    expect(source?.url).toContain('bipbop_16x9_variant.m3u8')
  })

  it('plays a pasted .m3u8 as HLS without guessing', () => {
    const source = resolveStreamSource('custom', params('url=https%3A%2F%2Fh%2Fx.m3u8'))
    expect(source?.detection.type).toBe('hls')
    expect(source?.kind).toBe('hls')
    expect(source?.guessedKind).toBe(false)
  })

  it('tries an unrecognised address as HLS and marks it guessed', () => {
    const source = resolveStreamSource('custom', params('url=https%3A%2F%2Fh%2Flive%2Fplaylist'))
    expect(source?.detection.type).toBe('hls')
    expect(source?.kind).toBe('hls')
    expect(source?.guessedKind).toBe(true)
  })

  it('lets as= force the type and still marks an unrecognised address, so the other kinds stay on offer', () => {
    const source = resolveStreamSource('custom', params('url=https%3A%2F%2Fh%2Flive%2Fplaylist&as=dash'))
    expect(source?.detection.type).toBe('dash')
    expect(source?.kind).toBe('dash')
    expect(source?.guessedKind).toBe(true)
  })

  it('does not call an address a guess when its own ending names the type', () => {
    const source = resolveStreamSource('custom', params('url=https%3A%2F%2Fh%2Fx.m3u8&as=dash'))
    expect(source?.kind).toBe('dash')
    expect(source?.guessedKind).toBe(false)
  })

  it('does not let as= turn a Twitch address into a stream', () => {
    expect(resolveStreamSource('custom', params('url=https%3A%2F%2Ftwitch.tv%2Fxqc&as=hls'))).toBeNull()
  })

  it('knows an mp4 address', () => {
    expect(resolveStreamSource('custom', params('url=https%3A%2F%2Fh%2Fc.mp4'))?.kind).toBe('mp4')
  })

  it('gives null for a Twitch address in the url query', () => {
    expect(resolveStreamSource('custom', params('url=https%3A%2F%2Ftwitch.tv%2Fxqc'))).toBeNull()
  })

  it('gives null for a YouTube address in the url query', () => {
    expect(
      resolveStreamSource('custom', params('url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dabc')),
    ).toBeNull()
  })
})

describe('resolveStreamSource and addresses that are not http(s)', () => {
  it.each([
    ['a javascript: address', 'javascript:alert(1)'],
    ['a path on this site', '/etc/passwd'],
    ['an address with no scheme', 'example.com/a.m3u8'],
    ['an ftp address', 'ftp://h/a.m3u8'],
    ['a data: address', 'data:text/plain,hi'],
  ])('gives null for %s', (_label, address) => {
    expect(resolveStreamSource('custom', params(`url=${encodeURIComponent(address)}`))).toBeNull()
  })

  it('accepts an upper-case scheme', () => {
    expect(resolveStreamSource('custom', params('url=HTTPS%3A%2F%2Fh%2Fa.m3u8'))?.kind).toBe('hls')
  })
})

describe('toStreamAddress', () => {
  it('keeps an http(s) address, trimmed', () => {
    expect(toStreamAddress('  https://h/a.m3u8 ', false)).toBe('https://h/a.m3u8')
    expect(toStreamAddress('http://h/a.m3u8', false)).toBe('http://h/a.m3u8')
  })

  it.each([false, true])('turns text with spaces into no address (bare allowed: %s)', (allowBare) => {
    expect(toStreamAddress('Dr. Disrespect', allowBare)).toBeNull()
    expect(toStreamAddress('S.T.A.L.K.E.R. 2', allowBare)).toBeNull()
  })

  it.each([false, true])('refuses other schemes (bare allowed: %s)', (allowBare) => {
    expect(toStreamAddress('javascript:alert(1)', allowBare)).toBeNull()
    expect(toStreamAddress('rtmp://h/live.m3u8', allowBare)).toBeNull()
  })

  it('adds https:// to a bare host and path only when that is allowed', () => {
    expect(toStreamAddress('cdn.example.com/live.m3u8', true)).toBe('https://cdn.example.com/live.m3u8')
    expect(toStreamAddress('cdn.example.com/live.m3u8', false)).toBeNull()
  })

  it('does not treat a single word as a host', () => {
    expect(toStreamAddress('xqc', true)).toBeNull()
  })
})
