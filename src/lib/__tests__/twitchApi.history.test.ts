import { getFollowerDates, getVideos, SessionExpiredError } from '../twitchApi'
import { STORAGE_KEYS } from '../../config/storageKeys'

function response(status: number, body: unknown = { data: [] }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

const SINCE = Date.parse('2026-10-12T00:00:00Z')

function page(dates: string[], total: number, cursor?: string) {
  return {
    total,
    data: dates.map((followed_at) => ({ followed_at })),
    pagination: cursor ? { cursor } : {},
  }
}

function urlOf(spy: ReturnType<typeof vi.spyOn>, call: number): URL {
  return new URL(String((spy.mock.calls[call] as unknown[])[0]))
}

describe('getFollowerDates', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('asks for 100 followers of the broadcaster, with no cursor on the first page', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, page([], 0)))

    await getFollowerDates('99', SINCE)

    const url = urlOf(spy, 0)
    expect(url.pathname).toBe('/helix/channels/followers')
    expect(url.searchParams.get('broadcaster_id')).toBe('99')
    expect(url.searchParams.get('first')).toBe('100')
    expect(url.searchParams.has('after')).toBe(false)
  })

  it('returns only the dates that are not older than the cut-off, and stops at the first older one', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(
        200,
        page(
          [
            '2026-11-10T10:00:00Z',
            '2026-10-12T00:00:00Z', // exactly the cut-off still counts
            '2026-10-11T23:59:59Z', // older: this is where it stops
            '2026-11-01T00:00:00Z', // never reached
          ],
          500,
          'next',
        ),
      ),
    )

    const result = await getFollowerDates('99', SINCE)

    expect(result.dates).toEqual(['2026-11-10T10:00:00Z', '2026-10-12T00:00:00Z'])
    expect(result.reachedCap).toBe(false)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)
  })

  it('follows the cursor across pages and takes the total from the first page', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, page(['2026-11-10T00:00:00Z'], 250, 'c1')))
      .mockResolvedValueOnce(response(200, page(['2026-11-09T00:00:00Z'], 249, 'c2')))
      .mockResolvedValueOnce(response(200, page(['2026-11-08T00:00:00Z'], 248)))

    const result = await getFollowerDates('99', SINCE)

    expect(result).toEqual({
      dates: ['2026-11-10T00:00:00Z', '2026-11-09T00:00:00Z', '2026-11-08T00:00:00Z'],
      total: 250,
      reachedCap: false,
    })
    expect(urlOf(spy, 1).searchParams.get('after')).toBe('c1')
    expect(urlOf(spy, 2).searchParams.get('after')).toBe('c2')
  })

  it('stops after maxPages pages and says so when more recent followers remained', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(response(200, page(['2026-11-10T00:00:00Z'], 900, 'more'))),
    )

    const result = await getFollowerDates('99', SINCE, 2)

    expect(spy).toHaveBeenCalledTimes(2)
    expect(result.dates).toHaveLength(2)
    expect(result.reachedCap).toBe(true)
  })

  it('reads at most 10 pages by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(response(200, page(['2026-11-10T00:00:00Z'], 5000, 'more'))),
    )

    const result = await getFollowerDates('99', SINCE)

    expect(spy).toHaveBeenCalledTimes(10)
    expect(result.reachedCap).toBe(true)
  })

  it('does not report the cap when the last allowed page was also the last page', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, page(['2026-11-10T00:00:00Z'], 2, 'c1')))
      .mockResolvedValueOnce(response(200, page(['2026-11-09T00:00:00Z'], 2)))

    const result = await getFollowerDates('99', SINCE, 2)

    expect(result.reachedCap).toBe(false)
  })

  it('does not report the cap when the last allowed page reached the cut-off', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(200, page(['2026-11-10T00:00:00Z'], 9, 'c1')))
      .mockResolvedValueOnce(response(200, page(['2026-11-09T00:00:00Z', '2026-09-01T00:00:00Z'], 9, 'c2')))

    const result = await getFollowerDates('99', SINCE, 2)

    expect(result.dates).toEqual(['2026-11-10T00:00:00Z', '2026-11-09T00:00:00Z'])
    expect(result.reachedCap).toBe(false)
  })

  it('gives an empty result for a channel with no followers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, page([], 0)))

    expect(await getFollowerDates('99', SINCE)).toEqual({ dates: [], total: 0, reachedCap: false })
  })

  it('copes with a response that has no data field at all', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, {}))

    expect(await getFollowerDates('99', SINCE)).toEqual({ dates: [], total: 0, reachedCap: false })
  })

  it('skips an entry whose date it cannot read instead of passing it on', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(200, page(['2026-11-10T00:00:00Z', 'not a date', '2026-11-09T00:00:00Z'], 3)),
    )

    const result = await getFollowerDates('99', SINCE)

    expect(result.dates).toEqual(['2026-11-10T00:00:00Z', '2026-11-09T00:00:00Z'])
  })

  it('treats an expired token as a session error and clears it', async () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(401))

    await expect(getFollowerDates('99', SINCE)).rejects.toBeInstanceOf(SessionExpiredError)
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBeNull()
  })

  it('returns dates only, never follower identities', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response(200, {
        total: 1,
        data: [{ followed_at: '2026-11-10T00:00:00Z', user_id: '7', user_login: 'viewer', user_name: 'Viewer' }],
        pagination: {},
      }),
    )

    const result = await getFollowerDates('99', SINCE)

    expect(JSON.stringify(result)).not.toContain('viewer')
    expect(JSON.stringify(result)).not.toContain('Viewer')
  })
})

describe('getVideos', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('sends only user_id and first when called the old way', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [] }))

    await getVideos('99', 20)

    const url = urlOf(spy, 0)
    expect([...url.searchParams.keys()].sort()).toEqual(['first', 'user_id'])
    expect(url.searchParams.get('first')).toBe('20')
  })

  it('still defaults to 50 videos', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [] }))

    await getVideos('99')

    expect(urlOf(spy, 0).searchParams.get('first')).toBe('50')
  })

  it('adds the type and cursor it is given', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [] }))

    await getVideos('99', 100, { type: 'archive', after: 'x' })

    const url = urlOf(spy, 0)
    expect(url.searchParams.get('user_id')).toBe('99')
    expect(url.searchParams.get('first')).toBe('100')
    expect(url.searchParams.get('type')).toBe('archive')
    expect(url.searchParams.get('after')).toBe('x')
  })

  it('adds only the option it is given', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(200, { data: [] }))

    await getVideos('99', 100, { type: 'archive' })

    const url = urlOf(spy, 0)
    expect(url.searchParams.get('type')).toBe('archive')
    expect(url.searchParams.has('after')).toBe(false)
  })
})
