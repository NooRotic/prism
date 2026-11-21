import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestFromChannel } from '../channelLatestApi'
import { isQuotaReached, resetQuotaForTests } from '../youtubeQuota'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const urlOf = (call: unknown[]) => new URL(String(call[0]))

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  resetQuotaForTests()
  localStorage.clear()
  vi.stubEnv('VITE_YOUTUBE_API_KEY', 'k')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const channel = { items: [{ id: 'UCabc', snippet: { title: 'Mr Beast' }, contentDetails: { relatedPlaylists: { uploads: 'UUabc' } } }] }
const upload = (id: string, title = `video ${id}`) => ({
  snippet: {
    title,
    publishedAt: '2026-11-20T10:00:00Z',
    description: 'd',
    thumbnails: { medium: { url: `https://i/${id}.jpg` } },
    resourceId: { videoId: id },
    videoOwnerChannelTitle: 'Mr Beast',
  },
  status: { privacyStatus: 'public' },
})

describe('latestFromChannel', () => {
  it('finds a channel by handle and reads its uploads: 2 calls, newest first', async () => {
    fetchMock
      .mockResolvedValueOnce(json(channel))
      .mockResolvedValueOnce(json({ items: [upload('aaaaaaaaaaa'), upload('bbbbbbbbbbb')] }))
    const result = await latestFromChannel('Mr Beast')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(urlOf(fetchMock.mock.calls[0]).pathname).toMatch(/\/channels$/)
    expect(urlOf(fetchMock.mock.calls[0]).searchParams.get('forHandle')).toBe('@MrBeast')
    expect(urlOf(fetchMock.mock.calls[1]).pathname).toMatch(/\/playlistItems$/)
    expect(urlOf(fetchMock.mock.calls[1]).searchParams.get('playlistId')).toBe('UUabc')
    expect(result).toMatchObject({ status: 'ok', channelTitle: 'Mr Beast' })
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.videos.map((v) => v.id)).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb'])
    expect(result.videos[0]).toMatchObject({ title: 'video aaaaaaaaaaa', channelTitle: 'Mr Beast', thumbnail: 'https://i/aaaaaaaaaaa.jpg' })
  })

  it('falls back to one channel search when no handle matches', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [] }))
      .mockResolvedValueOnce(json({ items: [{ id: { channelId: 'UCabc' } }] }))
      .mockResolvedValueOnce(json(channel))
      .mockResolvedValueOnce(json({ items: [upload('aaaaaaaaaaa')] }))
    const result = await latestFromChannel('the beast guy')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const search = urlOf(fetchMock.mock.calls[1])
    expect(search.pathname).toMatch(/\/search$/)
    expect(search.searchParams.get('type')).toBe('channel')
    expect(search.searchParams.get('q')).toBe('the beast guy')
    expect(urlOf(fetchMock.mock.calls[2]).searchParams.get('id')).toBe('UCabc')
    expect(result.status).toBe('ok')
  })

  it('says not found when neither the handle nor the search finds a channel', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [] })).mockResolvedValueOnce(json({ items: [] }))
    expect(await latestFromChannel('zzzz nobody')).toEqual({ status: 'notfound' })
  })

  it('skips private and deleted uploads', async () => {
    fetchMock
      .mockResolvedValueOnce(json(channel))
      .mockResolvedValueOnce(json({ items: [upload('aaaaaaaaaaa', 'Private video'), upload('bbbbbbbbbbb', 'Deleted video'), upload('ccccccccccc')] }))
    const result = await latestFromChannel('mrbeast')
    if (result.status !== 'ok') throw new Error('unreachable')
    expect(result.videos.map((v) => v.id)).toEqual(['ccccccccccc'])
  })

  it('answers from the cache the second time (no calls)', async () => {
    fetchMock.mockResolvedValueOnce(json(channel)).mockResolvedValueOnce(json({ items: [upload('aaaaaaaaaaa')] }))
    await latestFromChannel('MrBeast')
    fetchMock.mockClear()
    expect((await latestFromChannel('  mrbeast ')).status).toBe('ok')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports an error, and remembers the quota, when YouTube refuses for quota', async () => {
    fetchMock.mockResolvedValue(json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403))
    expect(await latestFromChannel('mrbeast')).toEqual({ status: 'error' })
    expect(isQuotaReached()).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports an error on a dead network', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    expect(await latestFromChannel('mrbeast')).toEqual({ status: 'error' })
  })
})
