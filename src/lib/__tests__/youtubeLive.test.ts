import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLiveSubscriptions } from '../youtubeLive'
import { resetQuotaForTests } from '../youtubeQuota'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ch = (n: number) => `UC${String(n).padStart(22, '0')}`
const sub = (n: number) => ({ id: ch(n), title: `Channel ${n}` })
const video = (id: string, channelId: string, over: { live?: string; embeddable?: boolean; viewers?: string | null } = {}) => ({
  id,
  snippet: { title: `title-${id}`, channelId, channelTitle: `chan-${channelId}`, liveBroadcastContent: over.live ?? 'live' },
  status: { embeddable: over.embeddable ?? true },
  liveStreamingDetails: {
    actualStartTime: '2026-11-21T20:00:00Z',
    ...(over.viewers === null ? {} : { concurrentViewers: over.viewers ?? '1234' }),
  },
})

let fetchMock: ReturnType<typeof vi.fn>
/** Answers by endpoint: playlistItems by playlist id, videos and channels from the given tables. */
function serve(opts: { uploads?: Record<string, string[]>; videos?: unknown[]; avatars?: Record<string, string>; failUploads?: number }) {
  fetchMock.mockImplementation(async (input: unknown) => {
    const url = new URL(String(input))
    const path = url.pathname.split('/').pop()
    if (path === 'playlistItems') {
      if (opts.failUploads) return json({ error: { errors: [{ reason: 'backendError' }] } }, opts.failUploads)
      const list = url.searchParams.get('playlistId')!
      const ids = opts.uploads?.[list] ?? []
      return json({ items: ids.map((videoId) => ({ contentDetails: { videoId } })) })
    }
    if (path === 'videos') {
      const wanted = url.searchParams.get('id')!.split(',')
      return json({ items: (opts.videos ?? []).filter((v) => wanted.includes((v as { id: string }).id)) })
    }
    if (path === 'channels') {
      const wanted = url.searchParams.get('id')!.split(',')
      return json({ items: wanted.map((id) => ({ id, snippet: { thumbnails: { default: { url: opts.avatars?.[id] ?? `av-${id}` } } } })) })
    }
    return json({}, 404)
  })
}
const uploadsOf = (channelId: string) => `UU${channelId.slice(2)}`

beforeEach(() => {
  localStorage.clear()
  resetQuotaForTests()
  vi.stubEnv('VITE_YOUTUBE_API_KEY', 'k')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('fetchLiveSubscriptions', () => {
  it('returns the subscribed channels that are live right now, with viewers, start time and avatar', async () => {
    serve({
      uploads: { [uploadsOf(ch(1))]: ['v1', 'old1'], [uploadsOf(ch(2))]: ['old2'] },
      videos: [video('v1', ch(1)), video('old1', ch(1), { live: 'none' }), video('old2', ch(2), { live: 'none' })],
    })
    const r = await fetchLiveSubscriptions([sub(1), sub(2)])
    expect(r).toEqual({
      status: 'ok',
      streams: [
        {
          channelId: ch(1),
          channelTitle: 'Channel 1',
          videoId: 'v1',
          title: 'title-v1',
          viewerCount: 1234,
          startedAt: '2026-11-21T20:00:00Z',
          avatarUrl: `av-${ch(1)}`,
        },
      ],
    })
  })

  it('leaves out a live stream that cannot be embedded, and upcoming premieres', async () => {
    serve({
      uploads: { [uploadsOf(ch(1))]: ['a'], [uploadsOf(ch(2))]: ['b'] },
      videos: [video('a', ch(1), { embeddable: false }), video('b', ch(2), { live: 'upcoming' })],
    })
    expect(await fetchLiveSubscriptions([sub(1), sub(2)])).toEqual({ status: 'ok', streams: [] })
  })

  it('reports viewers as null when the streamer hides the count', async () => {
    serve({ uploads: { [uploadsOf(ch(1))]: ['a'] }, videos: [video('a', ch(1), { viewers: null })] })
    const r = await fetchLiveSubscriptions([sub(1)])
    expect(r.status === 'ok' && r.streams[0].viewerCount).toBeNull()
  })

  it('costs about one unit per subscription: one playlist read each, videos batched by 50, avatars only for live channels', async () => {
    const subs = Array.from({ length: 60 }, (_, i) => sub(i + 1))
    const uploads: Record<string, string[]> = {}
    subs.forEach((s, i) => (uploads[uploadsOf(s.id)] = [`v${i}`]))
    serve({ uploads, videos: [video('v0', ch(1))] })
    await fetchLiveSubscriptions(subs)
    const paths = fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname.split('/').pop())
    expect(paths.filter((p) => p === 'playlistItems')).toHaveLength(60)
    expect(paths.filter((p) => p === 'videos')).toHaveLength(2)
    expect(paths.filter((p) => p === 'channels')).toHaveLength(1)
  })

  it('makes no avatar call when nobody is live', async () => {
    serve({ uploads: { [uploadsOf(ch(1))]: ['a'] }, videos: [video('a', ch(1), { live: 'none' })] })
    await fetchLiveSubscriptions([sub(1)])
    const paths = fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname.split('/').pop())
    expect(paths).not.toContain('channels')
  })

  it('stops and says the quota is used up when YouTube refuses for quota', async () => {
    fetchMock.mockResolvedValue(json({ error: { errors: [{ reason: 'quotaExceeded' }] } }, 403))
    expect(await fetchLiveSubscriptions([sub(1), sub(2)])).toEqual({ status: 'quota' })
  })

  it('is an error, not "nobody live", when every channel fails to read', async () => {
    serve({ failUploads: 500 })
    expect(await fetchLiveSubscriptions([sub(1), sub(2)])).toEqual({ status: 'error' })
  })

  it('skips a channel that is gone (404) and still answers for the rest', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = new URL(String(input))
      const path = url.pathname.split('/').pop()
      if (path === 'playlistItems') {
        return url.searchParams.get('playlistId') === uploadsOf(ch(1))
          ? json({ error: {} }, 404)
          : json({ items: [{ contentDetails: { videoId: 'b' } }] })
      }
      if (path === 'videos') return json({ items: [video('b', ch(2))] })
      return json({ items: [{ id: ch(2), snippet: { thumbnails: {} } }] })
    })
    const r = await fetchLiveSubscriptions([sub(1), sub(2)])
    expect(r.status === 'ok' && r.streams.map((s) => s.videoId)).toEqual(['b'])
  })

  it('still lists a live channel when the avatar lookup fails', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const path = new URL(String(input)).pathname.split('/').pop()
      if (path === 'playlistItems') return json({ items: [{ contentDetails: { videoId: 'a' } }] })
      if (path === 'videos') return json({ items: [video('a', ch(1))] })
      return json({ error: {} }, 500)
    })
    const r = await fetchLiveSubscriptions([sub(1)])
    expect(r.status === 'ok' && r.streams[0].avatarUrl).toBe('')
  })

  it('ignores channel ids that have no uploads playlist', async () => {
    serve({})
    expect(await fetchLiveSubscriptions([{ id: 'not-a-channel', title: 'x' }])).toEqual({ status: 'ok', streams: [] })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
