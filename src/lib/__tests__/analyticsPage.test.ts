import { describe, expect, it } from 'vitest'
import { analyticsPage, campaignQuery } from '../analyticsPage'

describe('analyticsPage: what address may be sent for a page', () => {
  it.each([
    ['/', '/', 'Home'],
    ['/twitch', '/twitch', 'Twitch'],
    ['/twitch/', '/twitch', 'Twitch'],
    ['/twitch/Shroud', '/twitch/shroud', 'Twitch channel'],
    ['/twitch/not a login', '/twitch/other', 'Twitch: other'],
    ['/youtube', '/youtube', 'YouTube'],
    ['/youtube/catchup', '/youtube/catchup', 'YouTube: Catch up'],
    ['/youtube/dQw4w9WgXcQ', '/youtube/dQw4w9WgXcQ', 'YouTube video'],
    ['/youtube/https%3A%2F%2Fexample.test%2Fa%3Fkey%3Dsecret', '/youtube/other', 'YouTube: other'],
    // A demo of another protocol is not a YouTube video.
    ['/youtube/bbb-hls', '/youtube/other', 'YouTube: other'],
    ['/hls-dash', '/hls-dash', 'HLS / DASH'],
    ['/hls-dash/custom', '/hls-dash/custom', 'HLS / DASH: pasted address'],
    ['/hls-dash/0123456789ab', '/hls-dash/0123456789ab', 'HLS / DASH stream'],
    ['/hls-dash/bbb-hls', '/hls-dash/bbb-hls', 'HLS / DASH stream'],
    ['/hls-dash/whatever', '/hls-dash/other', 'HLS / DASH: other'],
    ['/import', '/import', 'Import'],
    ['/token=secret', '/not-found', 'Not found'],
    ['/twitch/a/b', '/not-found', 'Not found'],
  ])('sends %s as %s (%s)', (pathname, path, title) => {
    expect(analyticsPage(pathname)).toEqual({ path, title })
  })

  it.each(['/admin', '/admin/', '/admin/usage', '/chat/shroud', '/chat-youtube/v:abc@UC1', '/popout/player'])('sends nothing for %s', (pathname) => {
    expect(analyticsPage(pathname)).toBeNull()
  })
})

describe('campaignQuery', () => {
  it('keeps the five campaign tags and nothing else', () => {
    expect(campaignQuery('?url=https%3A%2F%2Fx.test%2Fa&utm_source=linkedin&utm_content=post-prism&q=words')).toBe('?utm_source=linkedin&utm_content=post-prism')
    expect(campaignQuery('?utm_source=a&utm_medium=b&utm_campaign=c&utm_term=d&utm_content=e')).toBe('?utm_source=a&utm_medium=b&utm_campaign=c&utm_content=e&utm_term=d')
  })

  it('is empty when there are none', () => {
    expect(campaignQuery('?url=x')).toBe('')
    expect(campaignQuery('')).toBe('')
  })
})
