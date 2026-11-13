import { describe, it, expect } from 'vitest'
import { resolveStreamSource } from '../streamSource'

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

  it('lets as= force the type and clears the guess', () => {
    const source = resolveStreamSource('custom', params('url=https%3A%2F%2Fh%2Flive%2Fplaylist&as=dash'))
    expect(source?.detection.type).toBe('dash')
    expect(source?.kind).toBe('dash')
    expect(source?.guessedKind).toBe(false)
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
