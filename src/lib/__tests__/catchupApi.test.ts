import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { CatchupApiError, describeVideos, fetchSubscriptionLane, getMyChannel, listSubscriptions } from '../catchupApi'
import { readSLaneCache, writeSLaneCache } from '../catchupStore'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ch = (n: number) => `UC${String(n).padStart(22, '0')}`
const videoItem = (id: string, over: Record<string, unknown> = {}, dur = 'PT1M', embeddable = true) => ({
  id,
  snippet: { title: `t-${id}`, channelTitle: 'c', publishedAt: '2026-01-01T00:00:00Z', thumbnails: { medium: { url: `u-${id}` } }, ...over },
  contentDetails: { duration: dur },
  status: { embeddable },
})
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

describe('listSubscriptions', () => {
  it('follows nextPageToken until every channel is read, sending the bearer token', async () => {
    const page = (from: number, n: number, next?: string) => ({
      nextPageToken: next,
      items: Array.from({ length: n }, (_, i) => ({ snippet: { title: `c${from + i}`, resourceId: { channelId: ch(from + i) } } })),
    })
    fetchMock
      .mockResolvedValueOnce(json(page(0, 50, 'P2')))
      .mockResolvedValueOnce(json(page(50, 1)))
    const out = await listSubscriptions('tok')
    expect(out).toHaveLength(51)
    expect(out[50]).toEqual({ id: ch(50), title: 'c50' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(urlOf(fetchMock.mock.calls[1][0])).toContain('pageToken=P2')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer tok' } })
  })
})

describe('describeVideos', () => {
  it('drops non-embeddable and live/upcoming videos, keeps the caller order, batches by 50', async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `v${String(i).padStart(10, '0')}`)
    fetchMock.mockImplementation(async (input: unknown) => {
      const asked = new URL(urlOf(input)).searchParams.get('id')!.split(',')
      return json({
        items: [...asked].reverse().map((id) =>
          id === ids[1] ? videoItem(id, {}, 'PT1M', false) : id === ids[2] ? videoItem(id, {}, 'P0D') : videoItem(id),
        ),
      })
    })
    const out = await describeVideos(ids)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(out.map((v) => v.id)).toEqual(ids.filter((_, i) => i !== 1 && i !== 2))
    expect(out[0]).toMatchObject({ title: `t-${ids[0]}`, thumbnail: `u-${ids[0]}`, durationSec: 60 })
  })
})

describe('fetchSubscriptionLane', () => {
  const channels = [0, 1, 2].map((n) => ({ id: ch(n), title: `c${n}` }))

  function route(overrides: Record<string, () => Response> = {}) {
    fetchMock.mockImplementation(async (input: unknown) => {
      const u = new URL(urlOf(input))
      if (u.pathname.endsWith('/playlistItems')) {
        const list = u.searchParams.get('playlistId')!
        if (overrides[list]) return overrides[list]()
        return json({ items: [{ contentDetails: { videoId: `vid-${list.slice(-2)}` } }] })
      }
      const ids = u.searchParams.get('id')!.split(',')
      return json({
        items: ids.map((id, i) => videoItem(id, { publishedAt: `2026-01-0${(i % 9) + 1}T00:00:00Z` })),
      })
    })
  }

  it('skips a channel whose uploads playlist is missing and still returns the rest, newest first', async () => {
    route({ [`UU${'0'.repeat(21)}1`]: () => json({ error: { errors: [{ reason: 'playlistNotFound' }] } }, 404) })
    const lane = await fetchSubscriptionLane(channels)
    expect(lane).toHaveLength(2)
    const dates = lane.map((v) => v.publishedAt)
    expect([...dates].sort().reverse()).toEqual(dates)
  })

  it('caps the lane at opts.cap', async () => {
    route()
    expect(await fetchSubscriptionLane(channels, { cap: 1 })).toHaveLength(1)
  })

  it('returns the cached lane without calling fetch when the cache is warm', async () => {
    writeSLaneCache([{ id: 'cached00000', title: 't', channel: 'c', publishedAt: '', durationSec: 5, thumbnail: '' }])
    const lane = await fetchSubscriptionLane(channels)
    expect(lane.map((v) => v.id)).toEqual(['cached00000'])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws a 403 CatchupApiError when the quota is used up', async () => {
    route({ [`UU${'0'.repeat(21)}0`]: () => json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403) })
    await expect(fetchSubscriptionLane(channels)).rejects.toMatchObject({ name: 'CatchupApiError', status: 403 })
    await expect(fetchSubscriptionLane(channels)).rejects.toBeInstanceOf(CatchupApiError)
  })
})

describe('fetchSubscriptionLane failures that are not "this channel is gone"', () => {
  const channels = [0, 1, 2].map((n) => ({ id: ch(n), title: `c${n}` }))
  const ok = (list: string) => json({ items: [{ contentDetails: { videoId: `vid-${list.slice(-2)}` } }] })

  function routeWith(playlist: (list: string) => Response) {
    fetchMock.mockImplementation(async (input: unknown) => {
      const u = new URL(urlOf(input))
      if (u.pathname.endsWith('/playlistItems')) return playlist(u.searchParams.get('playlistId')!)
      return json({ items: u.searchParams.get('id')!.split(',').map((id) => videoItem(id)) })
    })
  }

  it('throws, and caches nothing, when every channel fails with a server error', async () => {
    routeWith(() => json({ error: { errors: [{ reason: 'backendError' }] } }, 500))
    await expect(fetchSubscriptionLane(channels)).rejects.toBeInstanceOf(CatchupApiError)
    expect(readSLaneCache()).toBeNull()
  })

  it('throws a "noKey" error when the API key is missing', async () => {
    vi.stubEnv('VITE_YOUTUBE_API_KEY', '')
    await expect(fetchSubscriptionLane(channels)).rejects.toMatchObject({ reason: 'noKey' })
    expect(readSLaneCache()).toBeNull()
  })

  it('throws when the network is down (fetch rejects)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchSubscriptionLane(channels)).rejects.toBeDefined()
    expect(readSLaneCache()).toBeNull()
  })

  it('returns what it got but does not cache the lane when only some channels failed', async () => {
    routeWith((list) => (list.endsWith('01') ? json({}, 500) : ok(list)))
    const lane = await fetchSubscriptionLane(channels)
    expect(lane).toHaveLength(2)
    expect(readSLaneCache()).toBeNull()
  })
})

describe('describeVideos keeps unplayable videos out', () => {
  const item = (id: string, snippet: Record<string, unknown>, contentDetails: Record<string, unknown> = {}) => ({
    id,
    snippet: { title: id, channelTitle: 'c', publishedAt: '2026-01-01T00:00:00Z', thumbnails: {}, ...snippet },
    contentDetails: { duration: 'PT1M', ...contentDetails },
    status: { embeddable: true },
  })

  it('drops a scheduled premiere (it has a length, but is not playable yet)', async () => {
    fetchMock.mockResolvedValue(json({ items: [item('premiere0001', { liveBroadcastContent: 'upcoming' }), item('normalvideo1', { liveBroadcastContent: 'none' })] }))
    expect((await describeVideos(['premiere0001', 'normalvideo1'])).map((v) => v.id)).toEqual(['normalvideo1'])
  })

  it('drops an age-restricted video (the embed refuses it)', async () => {
    fetchMock.mockResolvedValue(json({ items: [item('agerestrict1', {}, { contentRating: { ytRating: 'ytAgeRestricted' } }), item('normalvideo1', {})] }))
    expect((await describeVideos(['agerestrict1', 'normalvideo1'])).map((v) => v.id)).toEqual(['normalvideo1'])
  })
})

describe('fetchSubscriptionLane when forced', () => {
  it('ignores a warm cache and asks YouTube again', async () => {
    writeSLaneCache([{ id: 'cached00000', title: 't', channel: 'c', publishedAt: '', durationSec: 5, thumbnail: '' }])
    fetchMock.mockImplementation(async (input: unknown) => {
      const u = new URL(urlOf(input))
      if (u.pathname.endsWith('/playlistItems')) return json({ items: [{ contentDetails: { videoId: 'fresh000000' } }] })
      return json({ items: u.searchParams.get('id')!.split(',').map((id) => videoItem(id)) })
    })
    const lane = await fetchSubscriptionLane([{ id: ch(0), title: 'c0' }], { force: true })
    expect(fetchMock).toHaveBeenCalled()
    expect(lane.map((v) => v.id)).toEqual(['fresh000000'])
  })
})

describe('getMyChannel', () => {
  it("reads the signed-in owner's channel title and picture with the bearer token", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ items: [{ snippet: { title: 'NooRotic', thumbnails: { default: { url: 'https://img/d.jpg' }, medium: { url: 'https://img/m.jpg' } } } }] }),
    )
    expect(await getMyChannel('tok')).toEqual({ title: 'NooRotic', thumbnailUrl: 'https://img/d.jpg' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(urlOf(url)).toContain('channels?')
    expect(urlOf(url)).toContain('mine=true')
    expect(init).toMatchObject({ headers: { Authorization: 'Bearer tok' } })
  })

  it('returns null when the account has no channel', async () => {
    fetchMock.mockResolvedValueOnce(json({ items: [] }))
    expect(await getMyChannel('tok')).toBeNull()
  })
})
