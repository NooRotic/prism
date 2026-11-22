import { describe, expect, it } from 'vitest'
import { decodeTarget, encodeTarget, youtubeChatEmbedUrl, type YoutubeChatTarget } from '../youtubeChatTarget'

describe('the YouTube chat target code', () => {
  const all: YoutubeChatTarget[] = [
    { kind: 'looking' },
    { kind: 'video', videoId: 'abcdefghijk' },
    { kind: 'none', name: 'Some One' },
    { kind: 'failed', reason: 'quota' },
    { kind: 'failed', reason: 'error' },
  ]
  it('round-trips every kind', () => {
    for (const t of all) expect(decodeTarget(encodeTarget(t))).toEqual(t)
  })
  it('writes the short forms', () => {
    expect(all.map(encodeTarget)).toEqual(['looking', 'v:abcdefghijk', 'none:Some One', 'failed:quota', 'failed:error'])
  })
  it('carries the channel a video belongs to', () => {
    const t: YoutubeChatTarget = { kind: 'video', videoId: 'abcdefghijk', channelId: 'UC_x-1' }
    expect(encodeTarget(t)).toBe('v:abcdefghijk@UC_x-1')
    expect(decodeTarget('v:abcdefghijk@UC_x-1')).toEqual(t)
    expect(decodeTarget('v:abcdefghijk@')).toEqual({ kind: 'looking' })
  })
  it('keeps a name containing a colon', () => {
    expect(decodeTarget(encodeTarget({ kind: 'none', name: 'a:b:c' }))).toEqual({ kind: 'none', name: 'a:b:c' })
  })
  it('reads anything it does not recognise as still looking', () => {
    for (const s of ['', 'v:bad', 'v:abcdefghijk!', 'failed:other', 'nonsense']) expect(decodeTarget(s)).toEqual({ kind: 'looking' })
  })
  it('builds the embed address for this host', () => {
    expect(youtubeChatEmbedUrl('abcdefghijk', 'prism.nooroticx.tv')).toBe(
      'https://www.youtube.com/live_chat?v=abcdefghijk&embed_domain=prism.nooroticx.tv&dark_theme=1',
    )
  })
})
