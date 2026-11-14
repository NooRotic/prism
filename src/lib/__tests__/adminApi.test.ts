import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'
import {
  AUTH_HEADER,
  getChannels,
  getOverview,
  getSecurity,
  getSession,
  getTt,
  getUsage,
  removeChannel,
  unblockChannel,
} from '../adminApi'

const flags = vi.hoisted(() => ({ enabled: true, url: 'https://history.test' }))
vi.mock('../../config/historyServer', () => ({
  get HISTORY_ENABLED() {
    return flags.enabled
  },
  get HISTORY_API_URL() {
    return flags.url
  },
  SEND_VISITS: false,
}))

const SESSION = { owner: true, limits: { tt_day_budget: 1500, tt_run_budget: 300, new_per_day: 200, tail_days: 30 } }
const OVERVIEW = {
  pages: { today: 5, yesterday: 4 },
  chart: [{ date: '2026-11-12', pages: 5 }],
  new_channels: { last_24h: 2 },
  tt: { today: 100, paused: false },
  refused: { named_7d: 1, signed_out_today: 14 },
  needs_attention: ['tt_paused', 'job_stale'],
}
const USAGE = { days: [{ date: '2026-11-12', home: 1, twitch: 2, youtube: 3, 'hls-dash': 4, 'chat-popout': 5, other: 6 }] }
const TT = {
  days: [{ date: '2026-11-12', calls: 12 }],
  paused_until: '2026-11-13 00:00:00',
  last_run: { at_ms: 1_700_000_000_000, stopped_by: 'done', profiles: 1, gone: 0, dormant: 2, tt_ok: 12, tt_untracked: 3, tt_error: 0, tt_skipped: 0 },
}
const SECURITY = {
  signed_out_today: 3,
  attempts: [{ twitch_id: '2000', login: 'stranger', first_attempt_at: '2026-11-12 03:00:00', last_attempt_at: '2026-11-12 04:00:00', attempts: 2, via_script: true }],
  audit: [{ at: '2026-11-12 03:00:00', action: 'channel.remove', target: 'alice', detail: 'twitch_id=1' }],
}
const CHANNELS = {
  channels: [
    { twitch_id: '1', login: 'alice', display_name: 'Alice', status: 'tracking', tracked_since: '2026-11-12', last_visited_at: '2026-11-12 03:00:00', tt_status: 'ok' },
    { twitch_id: '2', login: 'bob', display_name: 'Bob', status: 'gone', tracked_since: '2026-11-01', last_visited_at: '2026-11-02 03:00:00', tt_status: null },
  ],
  blocked: [{ twitch_id: '9', login: 'banned', blocked_at: '2026-11-12 03:00:00' }],
}

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  flags.enabled = true
  flags.url = 'https://history.test'
  sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN, 'admintoken')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the request', () => {
  it('carries the admin token in the Authorization header, without cookies', async () => {
    fetchMock.mockReturnValue(reply(200, SESSION))

    await getSession()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/admin/session')
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('omit')
    expect(AUTH_HEADER).toBe('Authorization')
    expect(init.headers[AUTH_HEADER]).toBe('Bearer admintoken')
  })

  it('makes no request without a stored token, and says signed out', async () => {
    sessionStorage.clear()

    expect(await getOverview()).toEqual({ kind: 'signed_out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes no request with the kill switch off, and says unavailable', async () => {
    flags.enabled = false

    expect(await getOverview()).toEqual({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends the days and the search text as query parameters', async () => {
    fetchMock.mockImplementation(() => reply(200, { days: [] }))
    await getUsage(30)
    await getTt(90)
    fetchMock.mockImplementation(() => reply(200, { channels: [], blocked: [] }))
    await getChannels('a_b')

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://history.test/api/admin/usage?days=30',
      'https://history.test/api/admin/tt?days=90',
      'https://history.test/api/admin/channels?q=a_b',
    ])
  })
})

describe('what the server answers', () => {
  it.each([
    [401, { kind: 'signed_out' }, { error: 'signed_out' }],
    [403, { kind: 'refused', recorded: true }, { error: 'forbidden', recorded: true }],
    [403, { kind: 'refused', recorded: false }, { error: 'forbidden', recorded: false }],
    [403, { kind: 'refused', recorded: false }, 'not json'],
    [429, { kind: 'busy' }, { error: 'busy' }],
    [404, { kind: 'unavailable' }, { error: 'not_found' }],
    [500, { kind: 'unavailable' }, { error: 'server' }],
    [503, { kind: 'unavailable' }, { error: 'unavailable' }],
  ])('%i becomes %j', async (status, expected, body) => {
    fetchMock.mockReturnValue(reply(status, body))

    expect(await getOverview()).toEqual(expected)
  })

  it('says unavailable when the request fails or takes longer than 10 seconds', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'))
    expect(await getOverview()).toEqual({ kind: 'unavailable' })

    vi.useFakeTimers()
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const pending = getOverview()
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await pending).toEqual({ kind: 'unavailable' })
  })
})

describe('the seven reads', () => {
  it('maps each answer to camelCase data', async () => {
    fetchMock.mockReturnValueOnce(reply(200, SESSION))
    expect(await getSession()).toEqual({
      kind: 'ok',
      data: { limits: { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 } },
    })

    fetchMock.mockReturnValueOnce(reply(200, OVERVIEW))
    expect(await getOverview()).toEqual({
      kind: 'ok',
      data: {
        pages: { today: 5, yesterday: 4 },
        chart: [{ date: '2026-11-12', pages: 5 }],
        newChannels: { last24h: 2 },
        tt: { today: 100, paused: false },
        refused: { named7d: 1, signedOutToday: 14 },
        needsAttention: ['tt_paused', 'job_stale'],
      },
    })

    fetchMock.mockReturnValueOnce(reply(200, USAGE))
    expect(await getUsage(14)).toEqual({
      kind: 'ok',
      data: { days: [{ date: '2026-11-12', counts: { home: 1, twitch: 2, youtube: 3, 'hls-dash': 4, 'chat-popout': 5, other: 6 } }] },
    })

    fetchMock.mockReturnValueOnce(reply(200, TT))
    expect(await getTt(30)).toEqual({
      kind: 'ok',
      data: {
        days: [{ date: '2026-11-12', calls: 12 }],
        pausedUntil: '2026-11-13 00:00:00',
        lastRun: { atMs: 1_700_000_000_000, stoppedBy: 'done', profiles: 1, gone: 0, dormant: 2, ttOk: 12, ttUntracked: 3, ttError: 0, ttSkipped: 0 },
      },
    })

    fetchMock.mockReturnValueOnce(reply(200, { ...TT, paused_until: null, last_run: null }))
    expect(await getTt(30)).toMatchObject({ kind: 'ok', data: { pausedUntil: null, lastRun: null } })

    fetchMock.mockReturnValueOnce(reply(200, SECURITY))
    expect(await getSecurity()).toEqual({
      kind: 'ok',
      data: {
        signedOutToday: 3,
        attempts: [{ twitchId: '2000', login: 'stranger', firstAttemptAt: '2026-11-12 03:00:00', lastAttemptAt: '2026-11-12 04:00:00', attempts: 2, viaScript: true }],
        audit: [{ at: '2026-11-12 03:00:00', action: 'channel.remove', target: 'alice', detail: 'twitch_id=1' }],
      },
    })

    fetchMock.mockReturnValueOnce(reply(200, CHANNELS))
    expect(await getChannels('')).toEqual({
      kind: 'ok',
      data: {
        channels: [
          { twitchId: '1', login: 'alice', displayName: 'Alice', status: 'tracking', trackedSince: '2026-11-12', lastVisitedAt: '2026-11-12 03:00:00', ttStatus: 'ok' },
          { twitchId: '2', login: 'bob', displayName: 'Bob', status: 'gone', trackedSince: '2026-11-01', lastVisitedAt: '2026-11-02 03:00:00', ttStatus: null },
        ],
        blocked: [{ twitchId: '9', login: 'banned', blockedAt: '2026-11-12 03:00:00' }],
      },
    })
  })

  it.each([
    ['session', () => getSession()],
    ['overview', () => getOverview()],
    ['usage', () => getUsage(14)],
    ['tt', () => getTt(14)],
    ['security', () => getSecurity()],
    ['channels', () => getChannels('')],
  ])('treats a 200 with the wrong shape as unavailable: %s', async (_name, call) => {
    fetchMock.mockImplementation(() => reply(200, { unexpected: true }))
    expect(await call()).toEqual({ kind: 'unavailable' })

    fetchMock.mockImplementation(() => reply(200, 'not json'))
    expect(await call()).toEqual({ kind: 'unavailable' })
  })

  it('treats an unknown attention code as a wrong shape', async () => {
    fetchMock.mockReturnValue(reply(200, { ...OVERVIEW, needs_attention: ['mystery'] }))

    expect(await getOverview()).toEqual({ kind: 'unavailable' })
  })
})

describe('the two actions', () => {
  it.each([
    ['removeChannel', removeChannel, '/api/admin/channels/remove'],
    ['unblockChannel', unblockChannel, '/api/admin/channels/unblock'],
  ])('%s posts the id as JSON and returns ok', async (_name, act, path) => {
    fetchMock.mockReturnValue(reply(200, { ok: true }))

    expect(await act('123')).toEqual({ kind: 'ok', data: { ok: true } })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://history.test${path}`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ twitch_id: '123' })
  })

  it('tells "that channel is already gone" (404) apart from a broken server', async () => {
    fetchMock.mockReturnValueOnce(reply(404, { error: 'not_found' }))
    expect(await removeChannel('1')).toEqual({ kind: 'not_found' })

    fetchMock.mockReturnValueOnce(reply(500, { error: 'server' }))
    expect(await removeChannel('1')).toEqual({ kind: 'unavailable' })
  })
})
