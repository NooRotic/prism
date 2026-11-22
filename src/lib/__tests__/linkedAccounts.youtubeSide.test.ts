import { beforeEach, describe, expect, it } from 'vitest'
import {
  dismissYoutubeSuggestion,
  findByTwitch,
  findByYoutube,
  getLinks,
  isYoutubeSuggestionDismissed,
  linkYoutubeToTwitch,
  saveLink,
  unlinkYoutube,
} from '../linkedAccounts'

const yt = { channelId: 'UC1', title: 'Foo on YouTube' }

beforeEach(() => localStorage.clear())

describe('linkYoutubeToTwitch', () => {
  it('saves under the lower-case login', () => {
    linkYoutubeToTwitch('Foo', yt, true)
    expect(findByTwitch('foo')).toMatchObject({ twitch: 'foo', youtube: yt, confirmed: true })
  })

  it('keeps a Kick link already on that Twitch record, with one record only', () => {
    saveLink({ twitch: 'foo', kick: { slug: 'k' }, confirmed: false, linkedAt: 1 })
    linkYoutubeToTwitch('foo', yt, false)
    expect(getLinks()).toHaveLength(1)
    expect(findByTwitch('foo')).toMatchObject({ kick: { slug: 'k' }, youtube: yt })
  })

  it('re-saving the same login does not duplicate it', () => {
    linkYoutubeToTwitch('foo', yt, false)
    linkYoutubeToTwitch('FOO', yt, true)
    expect(getLinks()).toHaveLength(1)
    expect(findByTwitch('foo')?.confirmed).toBe(true)
  })

  it('moving the YouTube channel to another login strips it from the old record, keeping its Kick', () => {
    saveLink({ twitch: 'old', youtube: yt, kick: { slug: 'k' }, confirmed: true, linkedAt: 1 })
    linkYoutubeToTwitch('new', yt, false)
    expect(findByYoutube('UC1')?.twitch).toBe('new')
    const old = findByTwitch('old')
    expect(old?.kick).toEqual({ slug: 'k' })
    expect(old?.youtube).toBeUndefined()
  })

  it('moving the YouTube channel drops an old record left with nothing', () => {
    saveLink({ twitch: 'old', youtube: yt, confirmed: true, linkedAt: 1 })
    linkYoutubeToTwitch('new', yt, false)
    expect(findByTwitch('old')).toBeNull()
    expect(getLinks()).toHaveLength(1)
  })

  it('replaces a different YouTube channel on the same Twitch record', () => {
    saveLink({ twitch: 'foo', youtube: { channelId: 'UC9', title: 'Other' }, confirmed: true, linkedAt: 1 })
    linkYoutubeToTwitch('foo', yt, false)
    expect(findByTwitch('foo')?.youtube).toEqual(yt)
    expect(findByYoutube('UC9')).toBeNull()
  })
})

describe('unlinkYoutube', () => {
  it('removes the YouTube part, keeping a Kick-only remainder', () => {
    saveLink({ twitch: 'foo', youtube: yt, kick: { slug: 'k' }, confirmed: true, linkedAt: 1 })
    unlinkYoutube('UC1')
    expect(findByYoutube('UC1')).toBeNull()
    expect(findByTwitch('foo')).toMatchObject({ kick: { slug: 'k' } })
  })

  it('removes the record when nothing is left', () => {
    saveLink({ twitch: 'foo', youtube: yt, confirmed: true, linkedAt: 1 })
    unlinkYoutube('UC1')
    expect(getLinks()).toEqual([])
  })
})

describe('YouTube-side "not them"', () => {
  it('is remembered per YouTube channel', () => {
    dismissYoutubeSuggestion('UC1')
    expect(isYoutubeSuggestionDismissed('UC1')).toBe(true)
    expect(isYoutubeSuggestionDismissed('UC2')).toBe(false)
  })
})
