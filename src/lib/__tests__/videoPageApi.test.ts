import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getComments, getPlaylistItems, getVideoPage, searchTopic } from '../videoPageApi'
import { searchYouTubeVideos } from '../youtubeApi'

// youtubeApi reads its key once at import, so the search is faked here; the cache around it is what is tested.
vi.mock('../youtubeApi', () => ({ searchYouTubeVideos: vi.fn() }))

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const urlOf = (input: unknown) => String(input)

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('VITE_YOUTUBE_API_KEY', 'k')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const videoItem = {
  id: 'abcdefghijk',
  snippet: {
    title: 'T',
    channelTitle: 'C',
    channelId: 'UC1',
    publishedAt: '2026-01-01T00:00:00Z',
    description: 'D',
    tags: ['a', 'b'],
    thumbnails: { medium: { url: 'u' } },
  },
  statistics: { viewCount: '42' },
  topicDetails: { topicCategories: ['https://en.wikipedia.org/wiki/Video_game', 'https://en.wikipedia.org/wiki/Action-adventure_game'] },
}

describe('getVideoPage', () => {
  it('maps tags and topics, and asks for topicDetails', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [videoItem] }))
    const v = await getVideoPage('abcdefghijk')
    expect(v).toMatchObject({ id: 'abcdefghijk', title: 'T', channelId: 'UC1', viewCount: '42', description: 'D', tags: ['a', 'b'] })
    expect(v?.topics).toEqual(['Video game', 'Action-adventure game'])
    expect(urlOf(fetchMock.mock.calls[0][0])).toContain('topicDetails')
  })
  it('defaults tags to an empty list', async () => {
    const bare = { ...videoItem, snippet: { ...videoItem.snippet, tags: undefined }, topicDetails: undefined }
    fetchMock.mockResolvedValueOnce(json({ items: [bare] }))
    const v = await getVideoPage('abcdefghijk')
    expect(v?.tags).toEqual([])
    expect(v?.topics).toEqual([])
  })
  it('serves a second call from the cache', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [videoItem] }))
    await getVideoPage('abcdefghijk')
    await getVideoPage('abcdefghijk')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('is null with no key, and null when the video is not found', async () => {
    vi.stubEnv('VITE_YOUTUBE_API_KEY', '')
    expect(await getVideoPage('abcdefghijk')).toBeNull()
    vi.stubEnv('VITE_YOUTUBE_API_KEY', 'k')
    fetchMock.mockResolvedValueOnce(json({ items: [] }))
    expect(await getVideoPage('zzzzzzzzzzz')).toBeNull()
  })
})

describe('getComments', () => {
  const thread = {
    id: 'c1',
    snippet: {
      totalReplyCount: 2,
      topLevelComment: {
        snippet: { authorDisplayName: 'Ann', authorProfileImageUrl: 'p', textDisplay: 'hi', likeCount: 5, publishedAt: '2026-02-01T00:00:00Z' },
      },
    },
  }
  it('maps comments and asks for plain text', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [thread] }))
    const r = await getComments('abcdefghijk')
    expect(r).toEqual({
      status: 'ok',
      comments: [{ id: 'c1', author: 'Ann', authorImage: 'p', text: 'hi', likeCount: 5, publishedAt: '2026-02-01T00:00:00Z', replyCount: 2 }],
    })
    expect(urlOf(fetchMock.mock.calls[0][0])).toContain('textFormat=plainText')
  })
  it('says disabled for commentsDisabled', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { errors: [{ reason: 'commentsDisabled' }] } }, 403))
    expect(await getComments('abcdefghijk')).toEqual({ status: 'disabled' })
  })
  it('says error on a network failure and caches nothing', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    expect(await getComments('abcdefghijk')).toEqual({ status: 'error' })
    fetchMock.mockResolvedValueOnce(json({ items: [thread] }))
    expect((await getComments('abcdefghijk')).status).toBe('ok')
  })
})

describe('getPlaylistItems', () => {
  const entry = (id: string, title = `t-${id}`, privacy = 'public') => ({
    snippet: { title, resourceId: { videoId: id }, thumbnails: { medium: { url: `u-${id}` } } },
    status: { privacyStatus: privacy },
  })
  it('drops private and deleted entries and returns the next page token', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ nextPageToken: 'N', pageInfo: { totalResults: 120 }, items: [entry('a'), entry('b', 'Private video', 'private'), entry('c', 'Deleted video'), entry('d')] }),
    )
    const r = await getPlaylistItems('PLabcdefghij')
    expect(r).toEqual({
      status: 'ok',
      items: [
        { id: 'a', title: 't-a', thumbnail: 'u-a' },
        { id: 'd', title: 't-d', thumbnail: 'u-d' },
      ],
      nextPageToken: 'N',
      totalResults: 120,
    })
  })
  it('is unreadable on a 404', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: {} }, 404))
    expect(await getPlaylistItems('PLabcdefghij')).toEqual({ status: 'unreadable' })
  })
})

describe('searchTopic', () => {
  it('caches per lower-cased query and is empty on failure', async () => {
    const hit = { id: 'v', title: 't', channelTitle: 'c', thumbnail: '' }
    vi.mocked(searchYouTubeVideos).mockResolvedValueOnce({ videos: [hit], nextPageToken: null })
    const a = await searchTopic('Video Game')
    const b = await searchTopic('video game')
    expect(a).toEqual([hit])
    expect(b).toEqual([hit])
    expect(searchYouTubeVideos).toHaveBeenCalledTimes(1)
    vi.mocked(searchYouTubeVideos).mockRejectedValueOnce(new Error('x'))
    expect(await searchTopic('other')).toEqual([])
  })
  it('spends one search, not two, on a double click (the same query while it is still running)', async () => {
    vi.mocked(searchYouTubeVideos).mockClear()
    let resolve!: (v: { videos: never[]; nextPageToken: null }) => void
    vi.mocked(searchYouTubeVideos).mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    const first = searchTopic('Double Click')
    const second = searchTopic('double click')
    resolve({ videos: [], nextPageToken: null })
    await Promise.all([first, second])
    expect(searchYouTubeVideos).toHaveBeenCalledTimes(1)
  })
})
