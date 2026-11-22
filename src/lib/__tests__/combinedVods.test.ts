import { describe, expect, it } from 'vitest'
import { filterBySource, flagLikelyDuplicates, parseTwitchDuration, twitchToItem, youtubeToItem, type CombinedItem } from '../combinedVods'
import { sortVideos } from '../sortVideos'
import type { TwitchVideo } from '../../types/twitch'
import type { YouTubeVideo } from '../youtubeApi'

const tv = (over: Partial<TwitchVideo> = {}): TwitchVideo => ({
  id: '123',
  stream_id: 's',
  user_id: 'u',
  user_login: 'mrbeast',
  user_name: 'MrBeast',
  title: 'Speedrun night part 1',
  description: '',
  created_at: '2026-11-20T20:00:00Z',
  published_at: '2026-11-20T20:00:00Z',
  url: 'https://www.twitch.tv/videos/123',
  thumbnail_url: 'https://t/%{width}x%{height}.jpg',
  viewable: 'public',
  view_count: 1500,
  language: 'en',
  type: 'archive',
  duration: '3h25m10s',
  ...over,
})
const yv = (over: Partial<YouTubeVideo> = {}): YouTubeVideo => ({
  id: 'dQw4w9WgXcQ',
  title: 'Speedrun night part 1 (full stream)',
  channelTitle: 'MrBeast',
  thumbnail: 'https://y/thumb.jpg',
  publishedAt: '2026-11-21T02:00:00Z',
  viewCount: '900',
  description: '',
  ...over,
})
const item = (over: Partial<CombinedItem>): CombinedItem => ({ platform: 'twitch', id: 'x', title: 't', thumbnail: '', publishedAt: '2026-11-20T00:00:00Z', durationSec: null, ...over })

describe('parseTwitchDuration', () => {
  it.each([
    ['3h25m10s', 12310],
    ['45m', 2700],
    ['59s', 59],
    ['1h', 3600],
    ['', null],
    ['soon', null],
  ])('reads %j', (text, sec) => expect(parseTwitchDuration(text)).toBe(sec))
})

describe('mapping the two platforms onto one kind of card', () => {
  it('maps a Twitch VOD: sized thumbnail, view count as text, duration in seconds, its own address', () => {
    expect(twitchToItem(tv())).toEqual({
      platform: 'twitch',
      id: '123',
      title: 'Speedrun night part 1',
      thumbnail: 'https://t/320x180.jpg',
      publishedAt: '2026-11-20T20:00:00Z',
      viewCount: '1500',
      durationSec: 12310,
      url: 'https://www.twitch.tv/videos/123',
    })
  })

  it('maps a YouTube video: it plays on PRISM\'s YouTube page', () => {
    expect(youtubeToItem(yv())).toEqual({
      platform: 'youtube',
      id: 'dQw4w9WgXcQ',
      title: 'Speedrun night part 1 (full stream)',
      thumbnail: 'https://y/thumb.jpg',
      publishedAt: '2026-11-21T02:00:00Z',
      viewCount: '900',
      durationSec: null,
      url: '/youtube/dQw4w9WgXcQ',
    })
  })
})

describe('flagLikelyDuplicates', () => {
  const t = (over: Partial<CombinedItem> = {}) => item({ platform: 'twitch', id: 't1', title: 'Speedrun night part 1', publishedAt: '2026-11-20T20:00:00Z', ...over })
  const y = (over: Partial<CombinedItem> = {}) => item({ platform: 'youtube', id: 'y1', title: 'Speedrun night part 1 (full stream)', publishedAt: '2026-11-21T02:00:00Z', ...over })

  it('tags both sides when a Twitch VOD and a YouTube video are close in time and share most of their title', () => {
    const [a, b] = flagLikelyDuplicates([t(), y()])
    expect(a.alsoOn).toBe('youtube')
    expect(b.alsoOn).toBe('twitch')
  })

  it('does not tag videos far apart in time, even with the same title', () => {
    const out = flagLikelyDuplicates([t(), y({ publishedAt: '2026-12-05T02:00:00Z' })])
    expect(out.map((i) => i.alsoOn)).toEqual([undefined, undefined])
  })

  it('does not tag videos close in time with different titles', () => {
    const out = flagLikelyDuplicates([t(), y({ title: 'Q and A with chat' })])
    expect(out.map((i) => i.alsoOn)).toEqual([undefined, undefined])
  })

  it('never tags two videos from the same platform, and never removes any', () => {
    const list = [t(), t({ id: 't2' }), y()]
    const out = flagLikelyDuplicates(list)
    expect(out).toHaveLength(3)
    expect(out.map((i) => i.id)).toEqual(['t1', 't2', 'y1'])
  })

  it('pairs each video with at most one on the other side (the closest in time)', () => {
    const out = flagLikelyDuplicates([t(), y({ id: 'far', publishedAt: '2026-11-21T08:00:00Z' }), y({ id: 'near', publishedAt: '2026-11-20T21:00:00Z' })])
    expect(out.filter((i) => i.alsoOn).map((i) => i.id).sort()).toEqual(['near', 't1'])
  })

  it('does not change the list it is given', () => {
    const list = [t(), y()]
    flagLikelyDuplicates(list)
    expect(list[0].alsoOn).toBeUndefined()
  })
})

describe('filterBySource and sorting the mixed list', () => {
  const mixed = [item({ platform: 'twitch', id: 'a', publishedAt: '2026-01-01T00:00:00Z', viewCount: '5' }), item({ platform: 'youtube', id: 'b', publishedAt: '2026-03-01T00:00:00Z', viewCount: '50' })]
  it('keeps all, or one platform', () => {
    expect(filterBySource(mixed, 'all')).toHaveLength(2)
    expect(filterBySource(mixed, 'twitch').map((i) => i.id)).toEqual(['a'])
    expect(filterBySource(mixed, 'youtube').map((i) => i.id)).toEqual(['b'])
  })
  it('sorts the mixed list with the same sort the search grid uses', () => {
    expect(sortVideos(mixed, 'newest').map((i) => i.id)).toEqual(['b', 'a'])
    expect(sortVideos(mixed, 'oldest').map((i) => i.id)).toEqual(['a', 'b'])
    expect(sortVideos(mixed, 'views').map((i) => i.id)).toEqual(['b', 'a'])
  })
})
