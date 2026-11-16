import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { getHosts, trustHost, untrustHost } from '../adminApi'

vi.mock('../../config/historyServer', () => ({ HISTORY_ENABLED: true, HISTORY_API_URL: 'https://history.test', SEND_VISITS: false }))

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.setItem(STORAGE_KEYS.SESSION_ADMIN_TOKEN, 'admintoken')
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('getHosts', () => {
  it('reads the trusted and the restorable hosts', async () => {
    fetchMock.mockReturnValue(
      reply(200, {
        trusted: [{ host: 'solo.test', added_at: '2026-11-16 06:00:00', streams: 4, listed: 3 }],
        restorable: [{ host: 'content.uplynk.com', streams: 36 }],
      }),
    )

    const result = await getHosts()

    expect(fetchMock.mock.calls[0][0]).toBe('https://history.test/api/admin/hosts')
    expect(result).toEqual({
      kind: 'ok',
      data: {
        trusted: [{ host: 'solo.test', addedAt: '2026-11-16 06:00:00', streams: 4, listed: 3 }],
        restorable: [{ host: 'content.uplynk.com', streams: 36 }],
      },
    })
  })

  it('treats an answer of the wrong shape as the server not answering', async () => {
    fetchMock.mockReturnValue(reply(200, { trusted: 'no', restorable: [] }))

    expect(await getHosts()).toEqual({ kind: 'unavailable' })
  })
})

describe('trustHost', () => {
  it('posts the host and reads how many streams came back', async () => {
    fetchMock.mockReturnValue(reply(200, { ok: true, restored: 36, snapshot: true }))

    const result = await trustHost('content.uplynk.com')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/admin/hosts/trust')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ host: 'content.uplynk.com' })
    expect(result).toEqual({ kind: 'ok', data: { restored: 36, snapshot: true } })
  })

  it('tells an unknown host from a name that is not a host', async () => {
    fetchMock.mockReturnValueOnce(reply(404, { error: 'not_found' }))
    expect(await trustHost('nothere.test')).toEqual({ kind: 'not_found' })

    fetchMock.mockReturnValueOnce(reply(422, { error: 'rejected', reason: 'bad_host' }))
    expect(await trustHost('a/b')).toEqual({ kind: 'rejected' })
  })

  it('is signed out without a token and never calls the server', async () => {
    sessionStorage.clear()

    expect(await trustHost('content.uplynk.com')).toEqual({ kind: 'signed_out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('untrustHost', () => {
  it('posts the host and reads the answer', async () => {
    fetchMock.mockReturnValue(reply(200, { ok: true }))

    expect(await untrustHost('solo.test')).toEqual({ kind: 'ok', data: { ok: true } })
    expect(fetchMock.mock.calls[0][0]).toBe('https://history.test/api/admin/hosts/untrust')
  })

  it('says not_found for a host that was not trusted', async () => {
    fetchMock.mockReturnValue(reply(404, { error: 'not_found' }))

    expect(await untrustHost('solo.test')).toEqual({ kind: 'not_found' })
  })
})
