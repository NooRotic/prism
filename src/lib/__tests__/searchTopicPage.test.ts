import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchTopic, searchTopicPage } from '../videoPageApi'
import { searchYouTubeVideos } from '../youtubeApi'

vi.mock('../youtubeApi', () => ({ searchYouTubeVideos: vi.fn() }))

const hit = (id: string) => ({ id, title: id, channelTitle: 'c', thumbnail: '' })

beforeEach(() => {
  localStorage.clear()
  vi.mocked(searchYouTubeVideos).mockReset()
})

describe('searchTopicPage', () => {
  it('returns a page of videos with the token for the next one', async () => {
    vi.mocked(searchYouTubeVideos).mockResolvedValueOnce({ videos: [hit('a')], nextPageToken: 'T2' })
    expect(await searchTopicPage('Lofi Beats')).toEqual({ videos: [hit('a')], nextPageToken: 'T2' })
    expect(searchYouTubeVideos).toHaveBeenCalledWith('Lofi Beats', 8, undefined)
  })

  it('asks for the next page with its token, and caches every page on its own', async () => {
    vi.mocked(searchYouTubeVideos)
      .mockResolvedValueOnce({ videos: [hit('a')], nextPageToken: 'T2' })
      .mockResolvedValueOnce({ videos: [hit('b')], nextPageToken: null })
    await searchTopicPage('lofi')
    expect(await searchTopicPage('lofi', 'T2')).toEqual({ videos: [hit('b')], nextPageToken: null })
    expect(searchYouTubeVideos).toHaveBeenLastCalledWith('lofi', 8, 'T2')
    // Both pages again, from the cache: no more searches.
    await searchTopicPage('LOFI!')
    await searchTopicPage('lofi', 'T2')
    expect(searchYouTubeVideos).toHaveBeenCalledTimes(2)
  })

  it('does not remember a failed page, and answers empty', async () => {
    vi.mocked(searchYouTubeVideos).mockRejectedValueOnce(new Error('x'))
    expect(await searchTopicPage('flaky')).toEqual({ videos: [], nextPageToken: null })
    vi.mocked(searchYouTubeVideos).mockResolvedValueOnce({ videos: [hit('a')], nextPageToken: null })
    expect((await searchTopicPage('flaky')).videos).toHaveLength(1)
  })

  it('reads a first page cached by the older array-only format, with no next page', async () => {
    localStorage.setItem('prism_vp_topic_lofi', JSON.stringify({ at: Date.now(), value: [hit('old')] }))
    expect(await searchTopicPage('lofi')).toEqual({ videos: [hit('old')], nextPageToken: null })
    expect(searchYouTubeVideos).not.toHaveBeenCalled()
  })

  it('shares the first page with searchTopic, so one query is paid for once', async () => {
    vi.mocked(searchYouTubeVideos).mockResolvedValueOnce({ videos: [hit('a')], nextPageToken: 'T2' })
    await searchTopicPage('lofi')
    expect(await searchTopic('Lofi')).toEqual([hit('a')])
    expect(searchYouTubeVideos).toHaveBeenCalledTimes(1)
  })
})
