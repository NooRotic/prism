import { describe, expect, it } from 'vitest'
import { parseAccountLink } from '../parseAccountLink'

describe('parseAccountLink: YouTube', () => {
  it.each([
    ['https://www.youtube.com/@MrBeast', { platform: 'youtube', handle: 'MrBeast' }],
    ['youtube.com/@MrBeast/videos', { platform: 'youtube', handle: 'MrBeast' }],
    ['https://m.youtube.com/@mr.beast_6000?si=x', { platform: 'youtube', handle: 'mr.beast_6000' }],
    ['@MrBeast', { platform: 'youtube', handle: 'MrBeast' }],
    ['https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA', { platform: 'youtube', channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA' }],
    ['UCX6OQ3DkcsbYNE6H8uQQuVA', { platform: 'youtube', channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA' }],
  ])('reads %s', (text, expected) => expect(parseAccountLink(text)).toEqual(expected))

  it('does not guess from a video address, a playlist or a bare word', () => {
    expect(parseAccountLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(parseAccountLink('https://www.youtube.com/playlist?list=WL')).toBeNull()
    expect(parseAccountLink('mrbeast')).toBeNull()
    expect(parseAccountLink('https://www.youtube.com/@')).toBeNull()
  })
})

describe('parseAccountLink: Kick', () => {
  it.each([
    ['https://kick.com/xqc', 'xqc'],
    ['kick.com/Xqc/', 'xqc'],
    ['https://www.kick.com/some_streamer?x=1', 'some_streamer'],
  ])('reads %s', (text, slug) => expect(parseAccountLink(text)).toEqual({ platform: 'kick', slug }))

  it('ignores Kick pages that are not a channel', () => {
    expect(parseAccountLink('https://kick.com/')).toBeNull()
    expect(parseAccountLink('https://kick.com/categories/just-chatting')).toBeNull()
    expect(parseAccountLink('https://kick.com/video/abc')).toBeNull()
  })
})

describe('parseAccountLink: other input', () => {
  it('returns null for other sites, look-alike hosts, empty text and bad schemes', () => {
    for (const bad of ['', '   ', 'https://example.com/@x', 'https://youtube.com.evil.example/@x', 'https://evilkick.com/xqc', 'javascript:alert(1)', 'https://twitch.tv/xqc']) {
      expect(parseAccountLink(bad), bad).toBeNull()
    }
  })
})
