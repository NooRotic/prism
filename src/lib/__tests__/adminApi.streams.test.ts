import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { addStream, getStreams, pinStream, removeStream, setDefaultStream, updateStream } from '../adminApi'

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

const WIRE_STREAM = {
  public_id: '0123456789ab',
  name: 'Alpha News',
  url: 'https://alpha.test/live.m3u8',
  groups: ['News', 'Sports'],
  country: 'us',
  kind: 'hls',
  state: 'working',
  state_reason: null,
  pinned: true,
  is_default: false,
  source: 'hls-valid-2026-11',
  has_logo: true,
  added_at: '2026-11-14 03:00:00',
}
const WIRE_LIST = { streams: [WIRE_STREAM], total: 1, counts: { working: 1, held: 4 }, limit: 50, offset: 0 }

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

describe('getStreams', () => {
  it('asks for the first page with no filter by default', async () => {
    fetchMock.mockReturnValue(reply(200, WIRE_LIST))

    await getStreams({ text: '', state: '', country: '' }, { limit: 50, offset: 0 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/admin/streams?limit=50&offset=0')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer admintoken')
  })

  it('sends only the filters that are set, encoded', async () => {
    fetchMock.mockReturnValue(reply(200, WIRE_LIST))

    await getStreams({ text: 'a b&c=d', state: 'held', country: 'gb' }, { limit: 25, offset: 50 })

    const url = new URL(fetchMock.mock.calls[0][0])
    expect(url.searchParams.get('text')).toBe('a b&c=d')
    expect(url.searchParams.get('state')).toBe('held')
    expect(url.searchParams.get('country')).toBe('gb')
    expect([url.searchParams.get('limit'), url.searchParams.get('offset')]).toEqual(['25', '50'])
    expect([...url.searchParams.keys()].sort()).toEqual(['country', 'limit', 'offset', 'state', 'text'])
  })

  it('maps the answer to camelCase', async () => {
    fetchMock.mockReturnValue(reply(200, WIRE_LIST))

    expect(await getStreams({ text: '', state: '', country: '' }, { limit: 50, offset: 0 })).toEqual({
      kind: 'ok',
      data: {
        streams: [
          {
            publicId: '0123456789ab',
            name: 'Alpha News',
            url: 'https://alpha.test/live.m3u8',
            groups: ['News', 'Sports'],
            country: 'us',
            kind: 'hls',
            state: 'working',
            stateReason: null,
            pinned: true,
            isDefault: false,
            source: 'hls-valid-2026-11',
            hasLogo: true,
            addedAt: '2026-11-14 03:00:00',
          },
        ],
        total: 1,
        counts: { working: 1, held: 4 },
        limit: 50,
        offset: 0,
      },
    })
  })

  it('accepts a state reason and a stream with no country', async () => {
    fetchMock.mockReturnValue(reply(200, { ...WIRE_LIST, streams: [{ ...WIRE_STREAM, country: null, state: 'held', state_reason: 'port' }] }))

    const result = await getStreams({ text: '', state: '', country: '' }, { limit: 50, offset: 0 })

    expect(result).toMatchObject({ kind: 'ok', data: { streams: [{ country: null, state: 'held', stateReason: 'port' }] } })
  })

  it.each([
    ['not an object', 'nope'],
    ['no streams list', { ...WIRE_LIST, streams: undefined }],
    ['a total that is not a number', { ...WIRE_LIST, total: '1' }],
    ['a state nobody knows', { ...WIRE_LIST, streams: [{ ...WIRE_STREAM, state: 'mystery' }] }],
    ['a counts key nobody knows', { ...WIRE_LIST, counts: { mystery: 1 } }],
    ['a pin that is not a boolean', { ...WIRE_LIST, streams: [{ ...WIRE_STREAM, pinned: 1 }] }],
    ['groups that are not text', { ...WIRE_LIST, streams: [{ ...WIRE_STREAM, groups: [1] }] }],
    ['a kind nobody knows', { ...WIRE_LIST, streams: [{ ...WIRE_STREAM, kind: 'rtmp' }] }],
  ])('treats %s as unavailable', async (_label, body) => {
    fetchMock.mockReturnValue(reply(200, body))

    expect(await getStreams({ text: '', state: '', country: '' }, { limit: 50, offset: 0 })).toEqual({ kind: 'unavailable' })
  })

  it.each([
    [401, { kind: 'signed_out' }],
    [403, { kind: 'refused', recorded: false }],
    [429, { kind: 'busy' }],
    [400, { kind: 'unavailable' }],
    [404, { kind: 'unavailable' }],
    [500, { kind: 'unavailable' }],
  ])('%i becomes %j', async (status, expected) => {
    fetchMock.mockReturnValue(reply(status, { error: 'x' }))

    expect(await getStreams({ text: '', state: '', country: '' }, { limit: 50, offset: 0 })).toEqual(expected)
  })

  it('makes no request with the kill switch off or without a token', async () => {
    flags.enabled = false
    expect(await getStreams({ text: '', state: '', country: '' }, { limit: 50, offset: 0 })).toEqual({ kind: 'unavailable' })
    flags.enabled = true
    sessionStorage.clear()
    expect(await getStreams({ text: '', state: '', country: '' }, { limit: 50, offset: 0 })).toEqual({ kind: 'signed_out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the five stream actions', () => {
  const ID = '0123456789ab'
  const ACTIONS: [string, () => Promise<unknown>, string, unknown][] = [
    ['addStream', () => addStream({ url: 'https://a.test/x.m3u8', name: 'A', group: 'News' }), '/api/admin/streams/add', { url: 'https://a.test/x.m3u8', name: 'A', group: 'News' }],
    ['updateStream', () => updateStream(ID, { name: 'B', groups: ['News', 'Sports'] }), '/api/admin/streams/update', { public_id: ID, name: 'B', groups: ['News', 'Sports'] }],
    ['pinStream', () => pinStream(ID, true), '/api/admin/streams/pin', { public_id: ID, pinned: true }],
    ['setDefaultStream', () => setDefaultStream(ID), '/api/admin/streams/default', { public_id: ID }],
    ['removeStream', () => removeStream(ID), '/api/admin/streams/remove', { public_id: ID }],
  ]

  it.each(ACTIONS)('%s posts its JSON body to its own path', async (_name, call, path, body) => {
    fetchMock.mockReturnValue(reply(200, { ok: true, snapshot: true }))

    await call()

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`https://history.test${path}`)
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body)).toEqual(body)
  })

  it('returns the new id for an add, and says whether the visitor list was refreshed', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { ok: true, public_id: ID, snapshot: true }))
    expect(await addStream({ url: 'https://a.test/x', name: 'A', group: '' })).toEqual({ kind: 'ok', data: { publicId: ID, snapshot: true } })

    fetchMock.mockReturnValueOnce(reply(200, { ok: true, snapshot: false }))
    expect(await removeStream(ID)).toEqual({ kind: 'ok', data: { publicId: null, snapshot: false } })
  })

  it.each(ACTIONS)('%s: a 404 is "not found", not a broken server', async (_name, call) => {
    fetchMock.mockReturnValue(reply(404, { error: 'not_found' }))

    expect(await call()).toEqual({ kind: 'not_found' })
  })

  it.each(ACTIONS)('%s: a 422 gives the reason the server refused it for', async (_name, call) => {
    fetchMock.mockReturnValue(reply(422, { error: 'rejected', reason: 'token' }))

    expect(await call()).toEqual({ kind: 'rejected', reason: 'token' })
  })

  it('tells "already in the list" (409) from "not a stream visitors can see" (409)', async () => {
    fetchMock.mockReturnValueOnce(reply(409, { error: 'already_known', public_id: ID }))
    expect(await addStream({ url: 'https://a.test/x', name: 'A', group: '' })).toEqual({ kind: 'already_known', publicId: ID })

    fetchMock.mockReturnValueOnce(reply(409, { error: 'not_listed' }))
    expect(await setDefaultStream(ID)).toEqual({ kind: 'not_listed' })
  })

  it.each([
    ['a 409 nobody knows', 409, { error: 'mystery' }],
    ['a 422 with no reason', 422, { error: 'rejected' }],
    ['a 422 that is not JSON', 422, 'nope'],
    ['a 400', 400, { error: 'bad_request' }],
    ['a 413', 413, { error: 'too_large' }],
    ['a 500', 500, { error: 'server' }],
  ])('treats %s as unavailable', async (_label, status, body) => {
    fetchMock.mockReturnValue(reply(status, body))

    expect(await removeStream(ID)).toEqual({ kind: 'unavailable' })
  })

  it.each([
    [401, { kind: 'signed_out' }],
    [403, { kind: 'refused', recorded: false }],
    [429, { kind: 'busy' }],
  ])('%i becomes %j', async (status, expected) => {
    fetchMock.mockReturnValue(reply(status, { error: 'x' }))

    expect(await pinStream(ID, false)).toEqual(expected)
  })

  it('treats a 200 of the wrong shape, and a network failure, as unavailable', async () => {
    fetchMock.mockReturnValueOnce(reply(200, { fine: true }))
    expect(await removeStream(ID)).toEqual({ kind: 'unavailable' })

    fetchMock.mockReturnValueOnce(reply(200, { ok: true }))
    expect(await removeStream(ID)).toEqual({ kind: 'unavailable' })

    fetchMock.mockRejectedValueOnce(new TypeError('network down'))
    expect(await removeStream(ID)).toEqual({ kind: 'unavailable' })
  })

  it('makes no request without a token, and says signed out', async () => {
    sessionStorage.clear()

    expect(await removeStream(ID)).toEqual({ kind: 'signed_out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
