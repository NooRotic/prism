import { describe, expect, it } from 'vitest'
import { isMutual, mentionsTwitch, mentionsYoutube } from '../accountBios'

describe('mentionsTwitch', () => {
  it('finds the channel in a twitch.tv address, any case, with or without https and www', () => {
    expect(mentionsTwitch('Live at https://www.twitch.tv/Ogre_JPG every night', 'ogre_jpg')).toBe(true)
    expect(mentionsTwitch('twitch.tv/ogre_jpg', 'Ogre_JPG')).toBe(true)
    expect(mentionsTwitch('watch me: twitch.tv/ogre_jpg/videos', 'ogre_jpg')).toBe(true)
  })
  it('does not match a longer name, another channel or a bare word', () => {
    expect(mentionsTwitch('twitch.tv/ogre_jpg2', 'ogre_jpg')).toBe(false)
    expect(mentionsTwitch('twitch.tv/someone_else', 'ogre_jpg')).toBe(false)
    expect(mentionsTwitch('I stream ogre_jpg on twitch', 'ogre_jpg')).toBe(false)
    expect(mentionsTwitch('', 'ogre_jpg')).toBe(false)
  })
})

describe('mentionsYoutube', () => {
  const yt = { channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', handle: '@MrBeast' }
  it('finds the channel by handle or by channel address', () => {
    expect(mentionsYoutube('youtube.com/@mrbeast', yt)).toBe(true)
    expect(mentionsYoutube('https://www.youtube.com/@MrBeast/videos', yt)).toBe(true)
    expect(mentionsYoutube('https://youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA', yt)).toBe(true)
  })
  it('does not match a longer handle or another channel', () => {
    expect(mentionsYoutube('youtube.com/@MrBeast2', yt)).toBe(false)
    expect(mentionsYoutube('youtube.com/@someoneelse', yt)).toBe(false)
    expect(mentionsYoutube('I like MrBeast', yt)).toBe(false)
  })
  it('works with only an id, or only a handle', () => {
    expect(mentionsYoutube('youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA', { channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA' })).toBe(true)
    expect(mentionsYoutube('youtube.com/@MrBeast', { handle: 'MrBeast' })).toBe(true)
    expect(mentionsYoutube('youtube.com/@MrBeast', {})).toBe(false)
  })
})

describe('isMutual', () => {
  const base = {
    twitchLogin: 'mrbeast',
    twitchDescription: 'Videos at youtube.com/@MrBeast',
    youtube: { channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', handle: '@MrBeast', description: 'I also stream: twitch.tv/mrbeast' },
  }
  it('is true only when each bio names the other channel', () => {
    expect(isMutual(base)).toBe(true)
    expect(isMutual({ ...base, twitchDescription: 'no links here' })).toBe(false)
    expect(isMutual({ ...base, youtube: { ...base.youtube, description: 'no links here' } })).toBe(false)
  })
})
