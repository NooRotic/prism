import { describe, expect, it } from 'vitest'
import { firstTwitchMention, parseTwitchLogin } from '../parseTwitchLink'

describe('parseTwitchLogin', () => {
  it.each(['twitch.tv/Lofi_Girl', 'https://www.twitch.tv/lofi_girl?x=1', 'm.twitch.tv/lofi_girl/', '@lofi_girl', 'lofi_girl', '  Lofi_Girl  '])(
    'reads %s as lofi_girl',
    (input) => expect(parseTwitchLogin(input)).toBe('lofi_girl'),
  )

  it.each(['twitch.tv/videos/123', 'twitch.tv/directory', 'https://www.twitch.tv/', 'https://youtube.com/@x', 'javascript:alert(1)', '', 'a b', 'ab', 'evil.com/twitch.tv/foo', 'ftp://twitch.tv/foo'])(
    'rejects %s',
    (input) => expect(parseTwitchLogin(input)).toBeNull(),
  )
})

describe('firstTwitchMention', () => {
  it('skips addresses that are not channels and returns the first channel, lower case', () => {
    expect(firstTwitchMention('Follow me: https://twitch.tv/videos/1 and twitch.tv/Foo_Bar! also twitch.tv/other')).toBe('foo_bar')
  })

  it('skips clip links, look-alike domains and Twitch pages, so the real channel further on is found', () => {
    expect(firstTwitchMention('clip: https://clips.twitch.tv/AbstruseBraveWolfKappa-abc then twitch.tv/realname')).toBe('realname')
    expect(firstTwitchMention('m.twitch.tv/clip/SlugName twitch.tv/login twitch.tv/realname')).toBe('realname')
    expect(firstTwitchMention('eviltwitch.tv/foobar')).toBeNull()
  })

  it('is null without a twitch.tv address', () => {
    expect(firstTwitchMention('no links here, youtube.com/@x')).toBeNull()
    expect(firstTwitchMention('')).toBeNull()
  })
})
