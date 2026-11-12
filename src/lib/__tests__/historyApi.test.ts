import {
  fetchChannelHistory,
  loadChannelHistory,
  parseChannelHistory,
  visitChannel,
  type ChannelHistory,
  type HistoryRow,
} from '../historyApi'

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

const ROW = {
  date: '2026-11-12',
  rank: 217,
  minutes_streamed: 5658,
  avg_viewers: 7372,
  max_viewers: 14676,
  hours_watched: 695155,
  followers_change: -3745,
  followers_total: 11292376,
  tt_status: 'ok',
}

const PAYLOAD = {
  tracked: true,
  login: 'alice',
  display_name: 'Alice',
  avatar_url: 'https://img.example/alice.png',
  broadcaster_type: 'partner',
  language: 'en',
  category: 'Just Chatting',
  tracked_since: '2026-11-12',
  last_updated: '2026-11-12T03:00:00Z',
  tt_status: 'ok',
  bio_links: [{ platform: 'kick', url: 'https://kick.com/alice' }],
  latest: ROW,
  history: [ROW],
}

const CAMEL_ROW: HistoryRow = {
  date: '2026-11-12',
  rank: 217,
  minutesStreamed: 5658,
  avgViewers: 7372,
  maxViewers: 14676,
  hoursWatched: 695155,
  followersChange: -3745,
  followersTotal: 11292376,
  ttStatus: 'ok',
}

const EXPECTED: ChannelHistory = {
  login: 'alice',
  displayName: 'Alice',
  avatarUrl: 'https://img.example/alice.png',
  broadcasterType: 'partner',
  language: 'en',
  category: 'Just Chatting',
  trackedSince: '2026-11-12',
  lastUpdated: '2026-11-12T03:00:00Z',
  ttStatus: 'ok',
  bioLinks: [{ platform: 'kick', url: 'https://kick.com/alice' }],
  latest: CAMEL_ROW,
  history: [CAMEL_ROW],
}

/** A fetch that answers every call with a fresh Response (a body can only be read once). */
function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn((url: string, init?: RequestInit) => {
    void url
    void init
    return Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => {
  flags.enabled = true
  flags.url = 'https://history.test'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parseChannelHistory', () => {
  it('maps the server payload to camelCase', () => {
    expect(parseChannelHistory(PAYLOAD)).toEqual(EXPECTED)
  })

  it('keeps a missing number null, never 0', () => {
    const parsed = parseChannelHistory({
      ...PAYLOAD,
      latest: { ...ROW, rank: null, max_viewers: undefined },
      history: [{ ...ROW, hours_watched: null }],
    })

    expect(parsed?.latest?.rank).toBeNull()
    expect(parsed?.latest?.maxViewers).toBeNull()
    expect(parsed?.history[0].hoursWatched).toBeNull()
    expect(parsed?.history[0].avgViewers).toBe(7372)
  })

  it('accepts a payload with no latest row, no history, no links and null profile fields', () => {
    const parsed = parseChannelHistory({
      ...PAYLOAD,
      avatar_url: null,
      language: null,
      category: null,
      last_updated: null,
      tt_status: 'none',
      bio_links: [],
      latest: null,
      history: [],
    })

    expect(parsed).toMatchObject({ avatarUrl: null, language: null, category: null, lastUpdated: null, ttStatus: 'none', bioLinks: [], latest: null, history: [] })
  })

  it('turns an unknown row status into error and an unknown overall status into none', () => {
    const parsed = parseChannelHistory({ ...PAYLOAD, tt_status: 'weird', history: [{ ...ROW, tt_status: 'weird' }] })

    expect(parsed?.ttStatus).toBe('none')
    expect(parsed?.history[0].ttStatus).toBe('error')
  })

  it('drops a bio link it does not understand and keeps the rest', () => {
    const parsed = parseChannelHistory({
      ...PAYLOAD,
      bio_links: [{ platform: 'kick', url: 'https://kick.com/a' }, { platform: 'myspace', url: 'x' }, { platform: 'youtube' }, 'junk'],
    })

    expect(parsed?.bioLinks).toEqual([{ platform: 'kick', url: 'https://kick.com/a' }])
  })

  it.each([
    null,
    [],
    'a string',
    42,
    {},
    { tracked: false },
    { ...PAYLOAD, login: 5 },
    { ...PAYLOAD, history: 'nope' },
    { ...PAYLOAD, tracked_since: undefined },
    { ...PAYLOAD, history: [{ rank: 1 }] },
  ])('gives null for %j', (input) => {
    expect(parseChannelHistory(input)).toBeNull()
  })
})

describe('fetchChannelHistory', () => {
  it('gets the channel from the history server and parses it', async () => {
    const fetchMock = stubFetch(PAYLOAD)

    const result = await fetchChannelHistory('Alice')

    expect(result).toEqual({ kind: 'tracked', data: EXPECTED })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/channel?login=alice')
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('omit')
    expect(init?.headers).toBeUndefined()
  })

  it('sends requests to the configured server address', async () => {
    flags.url = 'https://other.test'
    const fetchMock = stubFetch(PAYLOAD)

    await fetchChannelHistory('alice')

    expect(fetchMock.mock.calls[0][0]).toBe('https://other.test/api/channel?login=alice')
  })

  it('treats a 404 with tracked false as untracked', async () => {
    stubFetch({ tracked: false }, 404)

    expect(await fetchChannelHistory('alice')).toEqual({ kind: 'untracked' })
  })

  it('treats any other 404 as unavailable, since it is not the server saying the channel is untracked', async () => {
    stubFetch({ error: 'not_found' }, 404)

    expect(await fetchChannelHistory('alice')).toEqual({ kind: 'unavailable' })
  })

  it.each([500, 503, 403, 400])('treats a %i as unavailable', async (status) => {
    stubFetch({ error: 'x' }, status)

    expect(await fetchChannelHistory('alice')).toEqual({ kind: 'unavailable' })
  })

  it('treats a 200 it cannot read as unavailable', async () => {
    stubFetch('<html>oops</html>')
    expect(await fetchChannelHistory('alice')).toEqual({ kind: 'unavailable' })

    stubFetch({ unexpected: true })
    expect(await fetchChannelHistory('alice')).toEqual({ kind: 'unavailable' })
  })

  it('treats a network error as unavailable and never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))))

    expect(await fetchChannelHistory('alice')).toEqual({ kind: 'unavailable' })
  })

  it('gives up after 10 seconds and is unavailable', async () => {
    vi.useFakeTimers()
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', hang)

    const pending = fetchChannelHistory('alice')
    await vi.advanceTimersByTimeAsync(10_000)

    expect(await pending).toEqual({ kind: 'unavailable' })
  })

  it('stops when the caller aborts', async () => {
    const controller = new AbortController()
    const hang = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', hang)

    const pending = fetchChannelHistory('alice', controller.signal)
    controller.abort()

    expect(await pending).toEqual({ kind: 'unavailable' })
  })

  it.each(['a b', '', 'x'.repeat(26), 'a/b', 'ünï'])('makes no request for the invalid login %j and says untracked', async (login) => {
    const fetchMock = stubFetch(PAYLOAD)

    expect(await fetchChannelHistory(login)).toEqual({ kind: 'untracked' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes no request and is unavailable when the history server is switched off', async () => {
    flags.enabled = false
    const fetchMock = stubFetch(PAYLOAD)

    expect(await fetchChannelHistory('alice')).toEqual({ kind: 'unavailable' })
    expect(await visitChannel('alice')).toEqual({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('visitChannel', () => {
  it('posts a JSON string body with credentials omitted and no custom headers, so it needs no preflight', async () => {
    const fetchMock = stubFetch(PAYLOAD)

    const result = await visitChannel('Alice')

    expect(result).toEqual({ kind: 'tracked', data: EXPECTED })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/visit')
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe('{"login":"alice"}')
    expect(init?.credentials).toBe('omit')
    expect(init?.headers).toBeUndefined()
  })

  it('maps a 404 with tracked false to untracked and a 503 to unavailable', async () => {
    stubFetch({ tracked: false }, 404)
    expect(await visitChannel('alice')).toEqual({ kind: 'untracked' })

    stubFetch({ error: 'disabled' }, 503)
    expect(await visitChannel('alice')).toEqual({ kind: 'unavailable' })
  })

  it('makes no request for an invalid login', async () => {
    const fetchMock = stubFetch(PAYLOAD)

    expect(await visitChannel('a b')).toEqual({ kind: 'untracked' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('loadChannelHistory', () => {
  it('with sendVisit false makes only a GET', async () => {
    const fetchMock = stubFetch(PAYLOAD)

    const result = await loadChannelHistory('alice', { sendVisit: false })

    expect(result.kind).toBe('tracked')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('GET')
  })

  it('with sendVisit true posts the visit and uses its answer without a second request', async () => {
    const fetchMock = stubFetch(PAYLOAD)

    const result = await loadChannelHistory('alice', { sendVisit: true })

    expect(result).toEqual({ kind: 'tracked', data: EXPECTED })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
  })

  it('falls back to a GET when the visit is unavailable', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"unavailable"}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(PAYLOAD), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await loadChannelHistory('alice', { sendVisit: true })

    expect(result.kind).toBe('tracked')
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'GET'])
  })

  it('does not fall back when the visit says the channel is untracked', async () => {
    const fetchMock = stubFetch({ tracked: false }, 404)

    expect(await loadChannelHistory('alice', { sendVisit: true })).toEqual({ kind: 'untracked' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
