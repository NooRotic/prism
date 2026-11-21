import { describe, expect, it } from 'vitest'
import { sortVideos } from '../sortVideos'
import type { YouTubeVideo } from '../youtubeApi'

const v = (id: string, publishedAt: string, viewCount?: string): YouTubeVideo => ({ id, title: id, channelTitle: 'c', thumbnail: '', publishedAt, viewCount, description: '' })
const list = [v('mid', '2026-05-01T00:00:00Z', '500'), v('old', '2026-01-01T00:00:00Z', '9000'), v('new', '2026-11-01T00:00:00Z', '10')]

describe('sortVideos', () => {
  it('newest first', () => expect(sortVideos(list, 'newest').map((x) => x.id)).toEqual(['new', 'mid', 'old']))
  it('oldest first', () => expect(sortVideos(list, 'oldest').map((x) => x.id)).toEqual(['old', 'mid', 'new']))
  it('most viewed first', () => expect(sortVideos(list, 'views').map((x) => x.id)).toEqual(['old', 'mid', 'new']))
  it('does not change the list it is given', () => {
    const copy = [...list]
    sortVideos(list, 'oldest')
    expect(list).toEqual(copy)
  })
  it('puts videos with no date or no view count last, whichever way it sorts, keeping their order', () => {
    const mixed = [v('nodate1', ''), v('a', '2026-02-01T00:00:00Z', '5'), v('nodate2', ''), v('b', '2026-03-01T00:00:00Z')]
    expect(sortVideos(mixed, 'newest').map((x) => x.id)).toEqual(['b', 'a', 'nodate1', 'nodate2'])
    expect(sortVideos(mixed, 'oldest').map((x) => x.id)).toEqual(['a', 'b', 'nodate1', 'nodate2'])
    expect(sortVideos(mixed, 'views').map((x) => x.id)).toEqual(['a', 'nodate1', 'nodate2', 'b'])
  })
  it('reads big view counts as numbers, not text', () => {
    const big = [v('small', '', '999'), v('large', '', '1000000')]
    expect(sortVideos(big, 'views').map((x) => x.id)).toEqual(['large', 'small'])
  })
})
