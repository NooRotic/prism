import { fetchTrackerSummary, parseTrackerSummary, resetTrackerSession } from '../twitchTracker'

const flags = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../config/twitchTracker', () => ({
  get TWITCHTRACKER_ENABLED() {
    return flags.enabled
  },
}))

const HOUR = 60 * 60 * 1000
const T0 = Date.UTC(2026, 10, 11, 12, 0, 0)

const REAL_ANSWER = {
  rank: 3290,
  minutes_streamed: 652,
  avg_viewers: 1226,
  max_viewers: 2894,
  hours_watched: 13314,
  followers: 13874,
  followers_total: 2484840,
}

const REAL_SUMMARY = {
  rank: 3290,
  minutesStreamed: 652,
  avgViewers: 1226,
  maxViewers: 2894,
  hoursWatched: 13314,
  followersGained: 13874,
  followersTotal: 2484840,
}

/** A fetch that answers every call with a fresh Response (a body can only be read once). */
function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('parseTrackerSummary', () => {
  it('maps every field of a real answer', () => {
    expect(parseTrackerSummary(REAL_ANSWER)).toEqual(REAL_SUMMARY)
  })

  it.each([{}, null, [], 'a string', 42])('gives null for %j', (input) => {
    expect(parseTrackerSummary(input)).toBeNull()
  })

  it('nulls only the field that is not a finite number', () => {
    const parsed = parseTrackerSummary({
      ...REAL_ANSWER,
      rank: '3290',
      avg_viewers: Infinity,
      max_viewers: null,
    })

    expect(parsed).toEqual({ ...REAL_SUMMARY, rank: null, avgViewers: null, maxViewers: null })
  })

  it('keeps a negative follower change', () => {
    expect(parseTrackerSummary({ ...REAL_ANSWER, followers: -12 })?.followersGained).toBe(-12)
  })

  it('gives null overall when every field is unusable', () => {
    expect(parseTrackerSummary({ rank: 'x', avg_viewers: {}, followers: NaN })).toBeNull()
  })
})

describe('fetchTrackerSummary', () => {
  beforeEach(() => {
    resetTrackerSession()
    flags.enabled = true
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('asks twitchtracker.com for the 30-day summary and sends no Authorization', async () => {
    const fetchMock = stubFetch(REAL_ANSWER)

    await expect(fetchTrackerSummary('streamer', T0)).resolves.toEqual(REAL_SUMMARY)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined]
    expect(url).toBe('https://twitchtracker.com/api/channels/summary/streamer')
    expect(JSON.stringify(init?.headers ?? {}).toLowerCase()).not.toContain('authorization')
  })

  it.each(['', 'a b', 'x'.repeat(26), '../etc', 'a/b', 'name?x=1'])(
    'gives null for the login %j without asking',
    async (login) => {
      const fetchMock = stubFetch(REAL_ANSWER)

      await expect(fetchTrackerSummary(login, T0)).resolves.toBeNull()

      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('answers from the cache for 6 hours without asking again', async () => {
    const fetchMock = stubFetch(REAL_ANSWER)
    await fetchTrackerSummary('streamer', T0)

    await expect(fetchTrackerSummary('streamer', T0 + 6 * HOUR - 1)).resolves.toEqual(REAL_SUMMARY)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('asks again once the cached answer is 6 hours old', async () => {
    const fetchMock = stubFetch(REAL_ANSWER)
    await fetchTrackerSummary('streamer', T0)

    await fetchTrackerSummary('streamer', T0 + 6 * HOUR)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the cache per login, whatever the capitalisation', async () => {
    const fetchMock = stubFetch(REAL_ANSWER)
    await fetchTrackerSummary('Streamer', T0)

    await fetchTrackerSummary('streamer', T0 + HOUR)
    await fetchTrackerSummary('someoneelse', T0 + HOUR)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('caches an empty answer for 1 hour only', async () => {
    const fetchMock = stubFetch({})
    await expect(fetchTrackerSummary('unknown', T0)).resolves.toBeNull()

    await fetchTrackerSummary('unknown', T0 + 59 * 60 * 1000)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await fetchTrackerSummary('unknown', T0 + 61 * 60 * 1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  describe.each([
    ['a network error', () => vi.fn(() => Promise.reject(new TypeError('Failed to fetch')))],
    ['a non-200 answer', () => vi.fn(() => Promise.resolve(new Response('nope', { status: 500 })))],
    ['invalid JSON', () => vi.fn(() => Promise.resolve(new Response('<html>', { status: 200 })))],
  ])('%s', (_name, makeFetch) => {
    it('gives null, stores nothing and is not retried this session', async () => {
      const fetchMock = makeFetch()
      vi.stubGlobal('fetch', fetchMock)

      await expect(fetchTrackerSummary('streamer', T0)).resolves.toBeNull()
      expect(localStorage.length).toBe(0)

      await expect(fetchTrackerSummary('streamer', T0 + 1000)).resolves.toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('stops every later request in the session after a 429', async () => {
    const fetchMock = stubFetch({}, 429)

    await expect(fetchTrackerSummary('first', T0)).resolves.toBeNull()
    await expect(fetchTrackerSummary('second', T0)).resolves.toBeNull()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(localStorage.length).toBe(0)
  })

  it('makes no request while TWITCHTRACKER_ENABLED is false', async () => {
    flags.enabled = false
    const fetchMock = stubFetch(REAL_ANSWER)

    await expect(fetchTrackerSummary('streamer', T0)).resolves.toBeNull()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shares one request between callers that ask for the same login at once', async () => {
    const fetchMock = stubFetch(REAL_ANSWER)

    const [a, b] = await Promise.all([
      fetchTrackerSummary('streamer', T0),
      fetchTrackerSummary('streamer', T0),
    ])

    expect(a).toEqual(REAL_SUMMARY)
    expect(b).toEqual(REAL_SUMMARY)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up on a request that never answers, and does not store anything', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = fetchTrackerSummary('streamer', T0)
    await vi.advanceTimersByTimeAsync(10_000)

    await expect(pending).resolves.toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it.each([
    ['not JSON', 'not json'],
    ['not an object', '"text"'],
    ['no fetchedAt', JSON.stringify({ summary: REAL_SUMMARY })],
    ['a summary with a string field', JSON.stringify({ fetchedAt: T0, summary: { ...REAL_SUMMARY, rank: 'x' } })],
    ['a time in the future', JSON.stringify({ fetchedAt: T0 + 5 * HOUR, summary: REAL_SUMMARY })],
  ])('ignores a cache record that is %s', async (_name, raw) => {
    localStorage.setItem('prism_tt_cache_streamer', raw)
    const fetchMock = stubFetch(REAL_ANSWER)

    await expect(fetchTrackerSummary('streamer', T0)).resolves.toEqual(REAL_SUMMARY)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('still answers when localStorage throws', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    stubFetch(REAL_ANSWER)

    await expect(fetchTrackerSummary('streamer', T0)).resolves.toEqual(REAL_SUMMARY)

    getItem.mockRestore()
    setItem.mockRestore()
  })
})
