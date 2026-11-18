import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { CatchupApiError, describeVideos, fetchSubscriptionLane, listSubscriptions } from '../catchupApi'
import { writeSLaneCache } from '../catchupStore'

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
