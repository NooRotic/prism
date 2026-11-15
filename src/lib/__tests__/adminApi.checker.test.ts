import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { applyChecker, getChecker, setCheckerPaused } from '../adminApi'

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

const WIRE = {
  mode: 'shadow',
  applied_at: null,
  paused: false,
  progress: { eligible: 3995, checked: 3412, oldest_result_at: '2026-11-15 00:10:00' },
  outcome: { pass: 2500, unreachable: 800, no_cors: 12 },
  would_hide: 812,
  counts: { new: 3995, held: 483 },
  clusters: [{ host: 'bad.test', streams: 12, failed: 9 }],
  guarded_hosts: [{ host: 'g.test', streams: 3 }],
  flagged: [{ public_id: '0123456789ab', name: 'Pinned one', pinned: true, is_default: false, state: 'dead' }],
  budget: { bytes_today: 5000, daily_cap: 1073741824, first_pass_bytes: 5000, first_pass_cap: 4294967296 },
  last_stop: { reason: 'run_guard', at: '2026-11-15 00:30:00' },
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
})

describe('getChecker', () => {
  it('asks for the status with the admin token and reads every field', async () => {
    fetchMock.mockReturnValue(reply(200, WIRE))

    const result = await getChecker()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/admin/checker')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer admintoken')
    expect(result).toEqual({
      kind: 'ok',
      data: {
        mode: 'shadow',
        appliedAt: null,
        paused: false,
        progress: { eligible: 3995, checked: 3412, oldestResultAt: '2026-11-15 00:10:00' },
        outcome: { pass: 2500, unreachable: 800, no_cors: 12 },
        wouldHide: 812,
        counts: { new: 3995, held: 483 },
        clusters: [{ host: 'bad.test', streams: 12, failed: 9 }],
        guardedHosts: [{ host: 'g.test', streams: 3 }],
        flagged: [{ publicId: '0123456789ab', name: 'Pinned one', pinned: true, isDefault: false, state: 'dead' }],
        budget: { bytesToday: 5000, dailyCap: 1073741824, firstPassBytes: 5000, firstPassCap: 4294967296 },
        lastStop: { reason: 'run_guard', at: '2026-11-15 00:30:00' },
      },
    })
  })

  it('reads a live checker with no stop recorded', async () => {
    fetchMock.mockReturnValue(reply(200, { ...WIRE, mode: 'live', applied_at: '2026-11-15 02:00:00', last_stop: null, would_hide: 0 }))

    const result = await getChecker()

    expect(result.kind === 'ok' && [result.data.mode, result.data.appliedAt, result.data.lastStop]).toEqual(['live', '2026-11-15 02:00:00', null])
  })

  it('accepts the empty lists PHP sends for empty maps', async () => {
    fetchMock.mockReturnValue(reply(200, { ...WIRE, outcome: [], counts: [], clusters: [], guarded_hosts: [], flagged: [] }))

    const result = await getChecker()

    expect(result.kind === 'ok' && [result.data.outcome, result.data.counts]).toEqual([{}, {}])
  })

  it('treats a wrong shape as the server not answering', async () => {
    fetchMock.mockReturnValue(reply(200, { ...WIRE, mode: 'maybe' }))
    expect((await getChecker()).kind).toBe('unavailable')

    fetchMock.mockReturnValue(reply(200, { ...WIRE, progress: { eligible: 'many' } }))
    expect((await getChecker()).kind).toBe('unavailable')

    fetchMock.mockReturnValue(reply(200, { ...WIRE, counts: { bogus_state: 1 } }))
    expect((await getChecker()).kind).toBe('unavailable')
  })

  it('maps 401 to signed out and 403 to refused, and makes no call without a token', async () => {
    fetchMock.mockReturnValue(reply(401, { error: 'signed_out' }))
    expect((await getChecker()).kind).toBe('signed_out')

    fetchMock.mockReturnValue(reply(403, { error: 'forbidden', recorded: true }))
    expect(await getChecker()).toEqual({ kind: 'refused', recorded: true })

    sessionStorage.removeItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN)
    fetchMock.mockClear()
    expect((await getChecker()).kind).toBe('signed_out')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('applyChecker', () => {
  it('posts an empty object and reads what was done', async () => {
    fetchMock.mockReturnValue(reply(200, { ok: true, hidden: 812, listed: 3183, snapshot: true }))

    const result = await applyChecker()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/admin/checker/apply')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{}')
    expect(result).toEqual({ kind: 'ok', data: { hidden: 812, listed: 3183, snapshot: true, already: false } })
  })

  it('reads the answer to a second press', async () => {
    fetchMock.mockReturnValue(reply(200, { ok: true, already: true, hidden: 0, listed: 3183, snapshot: true }))

    const result = await applyChecker()

    expect(result.kind === 'ok' && result.data.already).toBe(true)
  })

  it('turns a refusal into its own result with the reason', async () => {
    for (const reason of ['incomplete', 'stale', 'too_many_failures'] as const) {
      fetchMock.mockReturnValue(reply(409, { error: 'refused', reason }))
      expect(await applyChecker()).toEqual({ kind: 'refused_apply', reason })
    }
  })

  it('treats a refusal it does not know as the server not answering', async () => {
    fetchMock.mockReturnValue(reply(409, { error: 'refused', reason: 'because' }))
    expect((await applyChecker()).kind).toBe('unavailable')

    fetchMock.mockReturnValue(reply(409, 'not json'))
    expect((await applyChecker()).kind).toBe('unavailable')
  })
})

describe('setCheckerPaused', () => {
  it('pauses and resumes through their own addresses', async () => {
    fetchMock.mockReturnValue(reply(200, { ok: true, paused: true }))
    expect(await setCheckerPaused(true)).toEqual({ kind: 'ok', data: { paused: true } })
    expect(fetchMock.mock.calls[0][0]).toBe('https://history.test/api/admin/checker/pause')
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')

    fetchMock.mockReturnValue(reply(200, { ok: true, paused: false }))
    expect(await setCheckerPaused(false)).toEqual({ kind: 'ok', data: { paused: false } })
    expect(fetchMock.mock.calls[1][0]).toBe('https://history.test/api/admin/checker/resume')
  })
})
