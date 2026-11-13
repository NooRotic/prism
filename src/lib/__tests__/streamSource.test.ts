import { describe, it, expect } from 'vitest'
import { resolveStreamSource, toStreamAddress } from '../streamSource'

const params = (query: string) => new URLSearchParams(query)

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
