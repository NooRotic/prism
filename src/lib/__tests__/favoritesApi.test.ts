import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adjustFavoriteCount,
  getFavoriteCounts,
  loadFavoriteCounts,
  parseFavoriteCounts,
  resetFavoriteCounts,
  sendFavorite,
  subscribeFavoriteCounts,
} from '../favoritesApi'

vi.mock('../../config/historyServer', () => ({ HISTORY_ENABLED: true, HISTORY_API_URL: 'https://history.test', SEND_VISITS: false }))

const A = 'aaaaaaaaaaaa'
const B = 'bbbbbbbbbbbb'

const reply = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  resetFavoriteCounts()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseFavoriteCounts', () => {
  it('reads the counts of the version it knows', () => {
    expect(parseFavoriteCounts({ v: 1, counts: { [A]: 3, [B]: 1 } })).toEqual({ [A]: 3, [B]: 1 })
    expect(parseFavoriteCounts({ v: 1, counts: {} })).toEqual({})
  })

  it('refuses another shape or version', () => {
    for (const bad of [null, 5, 'x', [], {}, { v: 2, counts: {} }, { v: 1 }, { v: 1, counts: [] }, { v: 1, counts: 'no' }]) {
      expect(parseFavoriteCounts(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('drops an entry that is not a short id with a positive whole number, and keeps the rest', () => {
    const parsed = parseFavoriteCounts({ v: 1, counts: { [A]: 2, nothex: 4, [B]: 0, cccccccccccc: -1, dddddddddddd: 1.5, eeeeeeeeeeee: '3' } })

    expect(parsed).toEqual({ [A]: 2 })
  })
})

describe('loadFavoriteCounts', () => {
  it('fetches the counts once, with no credentials, and tells subscribers', async () => {
    fetchMock.mockReturnValue(reply(200, { v: 1, counts: { [A]: 5 } }))
    const listener = vi.fn()
    subscribeFavoriteCounts(listener)

    await loadFavoriteCounts()
    await loadFavoriteCounts()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/favorites')
    expect(init.credentials).toBe('omit')
    expect(getFavoriteCounts()).toEqual({ [A]: 5 })
    expect(listener).toHaveBeenCalled()
  })

  it('shares one request between callers that ask while it is in flight', async () => {
    fetchMock.mockReturnValue(reply(200, { v: 1, counts: {} }))

    await Promise.all([loadFavoriteCounts(), loadFavoriteCounts(), loadFavoriteCounts()])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows no counts, and tries again next time, when the server fails or answers nonsense', async () => {
    fetchMock.mockReturnValueOnce(reply(500, {})).mockReturnValueOnce(reply(200, { nope: true })).mockRejectedValueOnce(new Error('offline'))

    await loadFavoriteCounts()
    await loadFavoriteCounts()
    await loadFavoriteCounts()

    expect(getFavoriteCounts()).toEqual({})
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('adjustFavoriteCount', () => {
  it('moves a stream\'s total by one at once and never below zero', () => {
    const listener = vi.fn()
    subscribeFavoriteCounts(listener)

    adjustFavoriteCount(A, 1)
    adjustFavoriteCount(A, 1)
    expect(getFavoriteCounts()[A]).toBe(2)

    adjustFavoriteCount(A, -1)
    adjustFavoriteCount(A, -1)
    adjustFavoriteCount(A, -1)

    expect(getFavoriteCounts()[A]).toBeUndefined()
    expect(listener).toHaveBeenCalledTimes(5)
  })

  it('hands out a new object each time (it is a store snapshot)', () => {
    const before = getFavoriteCounts()

    adjustFavoriteCount(A, 1)

    expect(getFavoriteCounts()).not.toBe(before)
  })
})

describe('sendFavorite', () => {
  it('posts the id and the new state as plain text with no credentials and no custom headers', () => {
    fetchMock.mockReturnValue(Promise.resolve(new Response(null, { status: 204 })))

    sendFavorite(A, true)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://history.test/api/favorite')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ id: A, on: true })
    expect(init.credentials).toBe('omit')
    expect(init.keepalive).toBe(true)
    expect(init.headers).toBeUndefined()
  })

  it('sends nothing for an id the server would never have (a demo or a pasted address)', () => {
    sendFavorite('bbb-hls', true)
    sendFavorite('pasted:https://x.test/a.m3u8', true)
    sendFavorite('AAAAAAAAAAAA', true)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('never throws when the request fails', () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(() => sendFavorite(A, false)).not.toThrow()

    fetchMock.mockImplementation(() => {
      throw new Error('no fetch')
    })
    expect(() => sendFavorite(A, false)).not.toThrow()
  })
})
