import { loadStreamSnapshot, logoUrl, parseSnapshot, resetSnapshotCache, type StreamSnapshot } from '../streamsApi'

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
  v: 1,
  generated: '2026-11-14T05:00:00Z',
  default: '0123456789ab',
  groups: ['Other', 'General', 'News'],
  streams: [
    { i: '0123456789ab', n: 'Alpha', g: [0, 2], c: 'us', l: '0123456789ab.png', k: 'hls', p: 1, s: 'working', u: 'https://a.test/live.m3u8' },
    { i: 'ba9876543210', n: 'Beta', g: [1], c: null, l: null, k: 'dash', p: 0, s: 'new', u: 'http://b.test/manifest.mpd' },
  ],
}

const EXPECTED: StreamSnapshot = {
  generated: '2026-11-14T05:00:00Z',
  defaultId: '0123456789ab',
  groups: ['Other', 'General', 'News'],
  streams: [
    { id: '0123456789ab', name: 'Alpha', groups: [0, 2], country: 'us', logo: '0123456789ab.png', kind: 'hls', pinned: true, state: 'working', url: 'https://a.test/live.m3u8' },
    { id: 'ba9876543210', name: 'Beta', groups: [1], country: null, logo: null, kind: 'dash', pinned: false, state: 'new', url: 'http://b.test/manifest.mpd' },
  ],
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
  resetSnapshotCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parseSnapshot', () => {
  it('maps the contract to camelCase', () => {
    expect(parseSnapshot(WIRE)).toEqual(EXPECTED)
  })

  it('ignores fields it does not know, at every level', () => {
    const parsed = parseSnapshot({
      ...WIRE,
      future: { anything: 1 },
      streams: WIRE.streams.map((s) => ({ ...s, cc: true, quality: [720] })),
    })

    expect(parsed).toEqual(EXPECTED)
  })

  it('reads a null or missing default as null and a boolean pin as a pin', () => {
    expect(parseSnapshot({ ...WIRE, default: null })?.defaultId).toBeNull()
    const { default: _omitted, ...withoutDefault } = WIRE
    void _omitted
    expect(parseSnapshot(withoutDefault)?.defaultId).toBeNull()
    expect(parseSnapshot({ ...WIRE, streams: [{ ...WIRE.streams[0], p: true }] })?.streams[0].pinned).toBe(true)
  })

  it('keeps a cosmetic field that is not usable as null instead of throwing the list away', () => {
    const parsed = parseSnapshot({ ...WIRE, streams: [{ ...WIRE.streams[0], c: 'usa', l: 7 }] })

    expect(parsed?.streams[0].country).toBeNull()
    expect(parsed?.streams[0].logo).toBeNull()
  })

  it('lower-cases a country code', () => {
    expect(parseSnapshot({ ...WIRE, streams: [{ ...WIRE.streams[0], c: 'GB' }] })?.streams[0].country).toBe('gb')
  })

  const stream = WIRE.streams[0]
  const bad: [string, unknown][] = [
    ['null', null],
    ['an array', []],
    ['a string', 'hello'],
    ['a version other than 1', { ...WIRE, v: 2 }],
    ['no version', { ...WIRE, v: undefined }],
    ['streams not a list', { ...WIRE, streams: {} }],
    ['groups not a list', { ...WIRE, groups: 'News' }],
    ['a group that is not text', { ...WIRE, groups: ['Other', 3] }],
    ['no generated time', { ...WIRE, generated: undefined }],
    ['a default that is not text', { ...WIRE, default: 5 }],
    ['a stream that is not an object', { ...WIRE, streams: [null] }],
    ['a name that is not text', { ...WIRE, streams: [{ ...stream, n: 12 }] }],
    ['no id', { ...WIRE, streams: [{ ...stream, i: undefined }] }],
    ['an id with a slash', { ...WIRE, streams: [{ ...stream, i: 'a/b' }] }],
    ['an empty id', { ...WIRE, streams: [{ ...stream, i: '' }] }],
    ['a group index out of range', { ...WIRE, streams: [{ ...stream, g: [3] }] }],
    ['a negative group index', { ...WIRE, streams: [{ ...stream, g: [-1] }] }],
    ['a fractional group index', { ...WIRE, streams: [{ ...stream, g: [0.5] }] }],
    ['group indexes that are not a list', { ...WIRE, streams: [{ ...stream, g: 1 }] }],
    ['a javascript address', { ...WIRE, streams: [{ ...stream, u: 'javascript:alert(1)' }] }],
    ['an ftp address', { ...WIRE, streams: [{ ...stream, u: 'ftp://a.test/x' }] }],
    ['a relative address', { ...WIRE, streams: [{ ...stream, u: '/live.m3u8' }] }],
    ['no address', { ...WIRE, streams: [{ ...stream, u: undefined }] }],
    ['an unknown kind', { ...WIRE, streams: [{ ...stream, k: 'rtmp' }] }],
    ['an unlisted state', { ...WIRE, streams: [{ ...stream, s: 'dead' }] }],
  ]
  it.each(bad)('rejects %s', (_label, json) => {
    expect(parseSnapshot(json)).toBeNull()
  })

  it('accepts a list with no streams and no groups', () => {
    expect(parseSnapshot({ ...WIRE, default: null, groups: [], streams: [] })).toEqual({
      generated: WIRE.generated,
      defaultId: null,
      groups: [],
      streams: [],
    })
  })
})

describe('loadStreamSnapshot', () => {
  it('makes one plain GET to /api/streams, with no credentials and no custom headers', async () => {
    const fetchMock = stubFetch(WIRE)

    const result = await loadStreamSnapshot()

    expect(result).toEqual({ kind: 'ready', snapshot: EXPECTED })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/streams')
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('omit')
    expect(init?.headers).toBeUndefined()
  })

  it('makes no request at all when the server is switched off', async () => {
    flags.enabled = false
    const fetchMock = stubFetch(WIRE)

    expect(await loadStreamSnapshot()).toEqual({ kind: 'unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says unavailable, and does not throw, for a 503, an error status, a network error and bad JSON', async () => {
    for (const make of [
      () => stubFetch({ error: 'not_ready' }, 503),
      () => stubFetch({ error: 'server' }, 500),
      () => stubFetch({ error: 'forbidden_origin' }, 403),
      () => stubFetch('<html>not json</html>'),
      () => stubFetch({ ...WIRE, v: 9 }),
      () => {
        const mock = vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))
        vi.stubGlobal('fetch', mock)
        return mock
      },
    ]) {
      resetSnapshotCache()
      make()
      expect(await loadStreamSnapshot()).toEqual({ kind: 'unavailable' })
    }
  })

  it('treats an empty list as ready', async () => {
    stubFetch({ ...WIRE, default: null, groups: [], streams: [] })

    const result = await loadStreamSnapshot()

    expect(result.kind).toBe('ready')
    expect(result.kind === 'ready' ? result.snapshot.streams : null).toEqual([])
  })

  it('gives up after ten seconds', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      ),
    )

    const pending = loadStreamSnapshot()
    await vi.advanceTimersByTimeAsync(10_001)

    expect(await pending).toEqual({ kind: 'unavailable' })
  })

  it('remembers a good result for the page session and does not remember a failure', async () => {
    const fetchMock = stubFetch(WIRE)
    await loadStreamSnapshot()
    await loadStreamSnapshot()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resetSnapshotCache()
    const failing = stubFetch({ error: 'not_ready' }, 503)
    expect(await loadStreamSnapshot()).toEqual({ kind: 'unavailable' })
    expect(await loadStreamSnapshot()).toEqual({ kind: 'unavailable' })
    expect(failing).toHaveBeenCalledTimes(2)

    const recovered = stubFetch(WIRE)
    expect((await loadStreamSnapshot()).kind).toBe('ready')
    expect(recovered).toHaveBeenCalledTimes(1)
  })

  it('shares one request between callers that ask while it is in flight', async () => {
    const fetchMock = stubFetch(WIRE)

    const [a, b] = await Promise.all([loadStreamSnapshot(), loadStreamSnapshot()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('answers unavailable to a caller that has already given up, and still keeps the result for the next one', async () => {
    const fetchMock = stubFetch(WIRE)
    const controller = new AbortController()
    controller.abort()

    expect(await loadStreamSnapshot(controller.signal)).toEqual({ kind: 'unavailable' })
    expect((await loadStreamSnapshot()).kind).toBe('ready')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('logoUrl', () => {
  it('builds the server address only for the file names the server writes', () => {
    expect(logoUrl('0123456789ab.png')).toBe('https://history.test/logos/0123456789ab.png')
    expect(logoUrl('0123456789ab.jpg')).toBe('https://history.test/logos/0123456789ab.jpg')
    expect(logoUrl('0123456789ab.gif')).toBe('https://history.test/logos/0123456789ab.gif')
    expect(logoUrl('0123456789ab.webp')).toBe('https://history.test/logos/0123456789ab.webp')
  })

  it.each([
    '',
    '../secret.png',
    '0123456789ab.svg',
    'ABCDEF012345.png',
    '0123456789a.png',
    '0123456789abc.png',
    '0123456789ab',
    '0123456789ab.png/../x',
    'https://evil.test/x.png',
    '0123456789ab.png?x=1',
  ])('refuses %j', (file) => {
    expect(logoUrl(file)).toBeNull()
  })

  it('gives nothing when the server is switched off', () => {
    flags.enabled = false

    expect(logoUrl('0123456789ab.png')).toBeNull()
  })
})
