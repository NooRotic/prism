import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fastYoutubeChatTarget, findYoutubeChatTarget } from '../youtubeChatLookup'
import { writeLiveLast } from '../youtubeLiveStore'
import { resetQuotaForTests } from '../youtubeQuota'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const CH = 'UC0000000000000000000001'
const link = { channelId: CH, title: 'Some One' }
const liveVideo = {
  id: 'abcdefghijk',
  snippet: { title: 't', channelId: CH, channelTitle: 'Some One', liveBroadcastContent: 'live' },
  status: { embeddable: true },
  liveStreamingDetails: { concurrentViewers: '5' },
}
const listed = { channelId: CH, channelTitle: 'Some One', videoId: 'zyxwvutsrqp', title: 't', viewerCount: 1, startedAt: null, avatarUrl: '' }

let fetchMock: ReturnType<typeof vi.fn>
function serve(opts: { live?: boolean; status?: number; reason?: string }) {
  fetchMock.mockImplementation(async (input: unknown) => {
    if (opts.status) return json({ error: { errors: [{ reason: opts.reason ?? 'backendError' }] } }, opts.status)
    const path = new URL(String(input)).pathname.split('/').pop()
    if (path === 'playlistItems') return json({ items: [{ contentDetails: { videoId: 'abcdefghijk' } }] })
    if (path === 'videos') return json({ items: [opts.live ? liveVideo : { ...liveVideo, snippet: { ...liveVideo.snippet, liveBroadcastContent: 'none' } }] })
    return json({}, 404)
  })
}
const paths = () => fetchMock.mock.calls.map((c) => new URL(String(c[0])).pathname.split('/').pop())

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

describe('fastYoutubeChatTarget', () => {
  it('uses a rail answer from the last 15 minutes that lists the channel live', () => {
    const now = 1_000_000_000
    writeLiveLast({ checkedAt: now - 14 * 60_000, streams: [listed] })
    expect(fastYoutubeChatTarget(link, now)).toEqual({ kind: 'video', videoId: 'zyxwvutsrqp' })
  })
  it('does not trust an older answer, or one no check made', () => {
    const now = 1_000_000_000
    writeLiveLast({ checkedAt: now - 16 * 60_000, streams: [listed] })
    expect(fastYoutubeChatTarget(link, now)).toBeNull()
    writeLiveLast({ checkedAt: null, streams: [listed] })
    expect(fastYoutubeChatTarget(link, now)).toBeNull()
  })
})

describe('findYoutubeChatTarget', () => {
  it('finds the live video in exactly two calls', async () => {
    serve({ live: true })
    expect(await findYoutubeChatTarget(link)).toEqual({ kind: 'video', videoId: 'abcdefghijk' })
    expect(paths()).toEqual(['playlistItems', 'videos'])
  })
  it('makes no call when a fresh rail answer has it', async () => {
    const now = Date.now()
    writeLiveLast({ checkedAt: now, streams: [listed] })
    expect(await findYoutubeChatTarget(link, now)).toEqual({ kind: 'video', videoId: 'zyxwvutsrqp' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('says the streamer is not live by the linked name', async () => {
    serve({ live: false })
    expect(await findYoutubeChatTarget(link)).toEqual({ kind: 'none', name: 'Some One' })
  })
  it('says the daily limit is used up', async () => {
    serve({ status: 403, reason: 'quotaExceeded' })
    expect(await findYoutubeChatTarget(link)).toEqual({ kind: 'failed', reason: 'quota' })
  })
  it('says YouTube could not be reached', async () => {
    serve({ status: 500 })
    expect(await findYoutubeChatTarget(link)).toEqual({ kind: 'failed', reason: 'error' })
  })
})
