import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestFromChannel, moreFromChannel } from '../channelLatestApi'
import { resetQuotaForTests } from '../youtubeQuota'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const urlOf = (call: unknown[]) => new URL(String(call[0]))
const channel = (videoCount?: string) => ({
  items: [
    {
      id: 'UCabc',
      snippet: { title: 'Mr Beast' },
      contentDetails: { relatedPlaylists: { uploads: 'UUabc' } },
      statistics: videoCount === undefined ? {} : { videoCount },
    },
  ],
})
const upload = (id: string) => ({
  snippet: { title: `v ${id}`, publishedAt: '2026-11-20T10:00:00Z', description: '', thumbnails: {}, resourceId: { videoId: id } },
  status: { privacyStatus: 'public' },
})

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

describe('latestFromChannel: how many, and how to get more', () => {
  it('reads a page of 50 uploads (still 1 unit) and says how many the channel has and how to continue', async () => {
    fetchMock
      .mockResolvedValueOnce(json(channel('3412')))
      .mockResolvedValueOnce(json({ items: [upload('aaaaaaaaaaa')], nextPageToken: 'P2' }))
    const r = await latestFromChannel('mrbeast')
    expect(urlOf(fetchMock.mock.calls[0]).searchParams.get('part')).toContain('statistics')
    expect(urlOf(fetchMock.mock.calls[1]).searchParams.get('maxResults')).toBe('50')
    expect(r).toMatchObject({ status: 'ok', total: 3412, playlistId: 'UUabc', nextPageToken: 'P2' })
  })

  it('has no total when the channel does not report one, and no next page on the last page', async () => {
    fetchMock.mockResolvedValueOnce(json(channel())).mockResolvedValueOnce(json({ items: [upload('aaaaaaaaaaa')] }))
    const r = await latestFromChannel('mrbeast')
    expect(r).toMatchObject({ status: 'ok', total: null, nextPageToken: null })
  })
})

describe('moreFromChannel', () => {
  it('reads the next page of the uploads playlist with its token', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [upload('bbbbbbbbbbb')], nextPageToken: 'P3' }))
    const r = await moreFromChannel('UUabc', 'P2')
    const call = urlOf(fetchMock.mock.calls[0])
    expect(call.pathname).toMatch(/\/playlistItems$/)
    expect(call.searchParams.get('playlistId')).toBe('UUabc')
    expect(call.searchParams.get('pageToken')).toBe('P2')
    expect(call.searchParams.get('maxResults')).toBe('50')
    expect(r).toMatchObject({ status: 'ok', nextPageToken: 'P3' })
    if (r.status !== 'ok') throw new Error('unreachable')
    expect(r.videos.map((v) => v.id)).toEqual(['bbbbbbbbbbb'])
  })

  it('reads the first page when no token is given (a channel known only by its uploads playlist)', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [upload('aaaaaaaaaaa')], nextPageToken: 'P2' }))
    const r = await moreFromChannel('UUabc')
    expect(urlOf(fetchMock.mock.calls[0]).searchParams.has('pageToken')).toBe(false)
    expect(r).toMatchObject({ status: 'ok', nextPageToken: 'P2' })
  })

  it('answers the same page from the cache', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [upload('bbbbbbbbbbb')] }))
    await moreFromChannel('UUabc', 'P2')
    await moreFromChannel('UUabc', 'P2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports an error, and does not remember it', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: {} }, 500)).mockResolvedValueOnce(json({ items: [upload('bbbbbbbbbbb')] }))
    expect(await moreFromChannel('UUabc', 'P2')).toEqual({ status: 'error' })
    expect((await moreFromChannel('UUabc', 'P2')).status).toBe('ok')
  })
})
