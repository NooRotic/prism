import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import * as api from '../../lib/twitchApi'
import {
  FOLLOWS_REFRESH_MS,
  LIVE_REFRESH_MS,
  PANEL_OPEN_MAX_AGE_MS,
} from '../../lib/followsStore'
import type { TwitchFollowedChannel, TwitchStream } from '../../types/twitch'
import { useFollowedChannels } from '../useFollowedChannels'

// Only the two network calls are replaced; SessionExpiredError stays real so
// the hook's `instanceof` check keeps working.
vi.mock('../../lib/twitchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/twitchApi')>()
  return { ...actual, getFollowedChannelsPage: vi.fn(), getStreamsByUserIds: vi.fn() }
})

const pages = vi.mocked(api.getFollowedChannelsPage)
const streams = vi.mocked(api.getStreamsByUserIds)

const USER = 'me'

const follow = (id: string) =>
  ({
    broadcaster_id: id,
    broadcaster_login: `login${id}`,
    broadcaster_name: `Name${id}`,
    followed_at: '2026-01-01T00:00:00Z',
  }) as TwitchFollowedChannel

const live = (id: string) =>
  ({
    user_id: id,
    type: 'live',
    viewer_count: 10,
    game_name: 'Game',
    title: 'Title',
    thumbnail_url: '',
    started_at: '2026-01-01T00:00:00Z',
  }) as unknown as TwitchStream

type Hook = { current: ReturnType<typeof useFollowedChannels> }
const ids = (r: Hook) => r.current.data.map((f) => f.broadcaster_id)
const liveIds = (r: Hook) =>
  r.current.data.filter((f) => f.isLive).map((f) => f.broadcaster_id)

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useFollowedChannels: one shared copy, kept fresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    pages.mockResolvedValue({ data: [follow('1'), follow('2'), follow('3')], cursor: null })
    streams.mockResolvedValue([live('1')])
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads the follows and their live state once on mount', async () => {
    const hook = renderHook(() => useFollowedChannels(USER))
    await settle()

    expect(ids(hook.result)).toEqual(['1', '2', '3'])
    expect(liveIds(hook.result)).toEqual(['1'])
    expect(hook.result.current.loading).toBe(false)
    expect(pages).toHaveBeenCalledTimes(1)
    expect(streams).toHaveBeenCalledTimes(1)
  })

  it('is one fetch and one copy of the data, however many components use it', async () => {
    const rail = renderHook(() => useFollowedChannels(USER))
    const panel = renderHook(() => useFollowedChannels(USER))
    await settle()

    expect(pages).toHaveBeenCalledTimes(1)
    expect(streams).toHaveBeenCalledTimes(1)
    expect(liveIds(panel.result)).toEqual(liveIds(rail.result))
  })

  it('refreshes who is live every minute, for every user of the hook, without refetching the follow list', async () => {
    const rail = renderHook(() => useFollowedChannels(USER))
    const panel = renderHook(() => useFollowedChannels(USER))
    await settle()
    expect(liveIds(rail.result)).toEqual(['1'])

    streams.mockResolvedValue([live('2'), live('3')]) // 1 went offline, 2 and 3 came on
    await advance(LIVE_REFRESH_MS)

    expect(liveIds(rail.result)).toEqual(['2', '3'])
    expect(liveIds(panel.result)).toEqual(['2', '3'])
    expect(pages).toHaveBeenCalledTimes(1)
  })

  it('does not show the loading state during a background refresh', async () => {
    const seen: boolean[] = []
    renderHook(() => {
      const r = useFollowedChannels(USER)
      seen.push(r.loading)
      return r
    })
    await settle()
    seen.length = 0

    await advance(LIVE_REFRESH_MS)

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((loading) => loading === false)).toBe(true)
  })

  it('keeps the list when a refresh fails, and recovers on the next one', async () => {
    const hook = renderHook(() => useFollowedChannels(USER))
    await settle()

    streams.mockRejectedValueOnce(new Error('HTTP 429'))
    await advance(LIVE_REFRESH_MS)
    expect(liveIds(hook.result)).toEqual(['1']) // not blanked
    expect(hook.result.current.error).toBeNull()

    streams.mockResolvedValue([live('3')])
    await advance(LIVE_REFRESH_MS)
    expect(liveIds(hook.result)).toEqual(['3'])
  })

  it('reloads the follow list every few minutes and picks up a new follow', async () => {
    const hook = renderHook(() => useFollowedChannels(USER))
    await settle()

    pages.mockResolvedValue({
      data: [follow('9'), follow('1'), follow('2'), follow('3')],
      cursor: null,
    })
    await advance(FOLLOWS_REFRESH_MS)

    expect(ids(hook.result)).toEqual(['9', '1', '2', '3'])
  })

  it('does not poll while the tab is hidden', async () => {
    renderHook(() => useFollowedChannels(USER))
    await settle()

    setVisibility('hidden')
    await advance(LIVE_REFRESH_MS * 3)

    expect(streams).toHaveBeenCalledTimes(1)
  })

  it('refreshes straight away when the tab comes back after a while', async () => {
    const hook = renderHook(() => useFollowedChannels(USER))
    await settle()
    setVisibility('hidden')
    await advance(LIVE_REFRESH_MS * 3)

    streams.mockResolvedValue([live('2')])
    setVisibility('visible')
    await settle()

    expect(liveIds(hook.result)).toEqual(['2'])
  })

  it('does not refresh again when the tab comes back right away', async () => {
    renderHook(() => useFollowedChannels(USER))
    await settle()

    setVisibility('hidden')
    await advance(5_000)
    setVisibility('visible')
    await settle()

    expect(streams).toHaveBeenCalledTimes(1)
  })

  it('stops polling once nothing is using it any more', async () => {
    const hook = renderHook(() => useFollowedChannels(USER))
    await settle()
    hook.unmount()

    await advance(FOLLOWS_REFRESH_MS * 2)

    expect(streams).toHaveBeenCalledTimes(1)
    expect(pages).toHaveBeenCalledTimes(1)
  })

  it('refreshLive (used when the Following panel opens) skips fresh data and refreshes stale data', async () => {
    const hook = renderHook(() => useFollowedChannels(USER))
    await settle()
    streams.mockResolvedValue([live('2')])

    act(() => hook.result.current.refreshLive())
    await settle()
    expect(streams).toHaveBeenCalledTimes(1) // just loaded: nothing to do

    await advance(PANEL_OPEN_MAX_AGE_MS + 1)
    act(() => hook.result.current.refreshLive())
    await settle()
    expect(streams).toHaveBeenCalledTimes(2)
    expect(liveIds(hook.result)).toEqual(['2'])
  })

  it('reports a failed first load, then retries it on the next tick', async () => {
    streams.mockRejectedValueOnce(new Error('HTTP 503'))
    const hook = renderHook(() => useFollowedChannels(USER))
    await settle()
    expect(hook.result.current.error).toMatch(/503/)
    expect(hook.result.current.data).toEqual([])

    await advance(LIVE_REFRESH_MS)

    expect(hook.result.current.error).toBeNull()
    expect(liveIds(hook.result)).toEqual(['1'])
  })

  it('hands a session error to the auth handler', async () => {
    const handleAuthError = vi.fn()
    streams.mockRejectedValueOnce(new api.SessionExpiredError())

    renderHook(() => useFollowedChannels(USER, { handleAuthError }))
    await settle()

    expect(handleAuthError).toHaveBeenCalled()
  })

  describe('with a long follow list', () => {
    // Page n holds follow "n" and a cursor "c<n>" until the last page. A fresh
    // load reads four pages, so the fourth leaves a cursor for "load more".
    function chainedPages(total: number) {
      pages.mockImplementation(async (_user, _first, after) => {
        const n = after ? Number(after.slice(1)) + 1 : 1
        return { data: [follow(String(n))], cursor: n < total ? `c${n}` : null }
      })
    }

    it('load more appends the next page with its live state, and a later refresh keeps those rows', async () => {
      chainedPages(6)
      streams.mockResolvedValueOnce([live('1')])
      const hook = renderHook(() => useFollowedChannels(USER))
      await settle()
      expect(ids(hook.result)).toEqual(['1', '2', '3', '4'])
      expect(hook.result.current.cursor).toBe('c4')

      streams.mockResolvedValueOnce([live('5')])
      await act(async () => {
        await hook.result.current.loadMore()
      })
      expect(ids(hook.result)).toEqual(['1', '2', '3', '4', '5'])
      expect(liveIds(hook.result)).toEqual(['1', '5'])

      streams.mockResolvedValue([live('2'), live('5')])
      await advance(LIVE_REFRESH_MS)

      expect(ids(hook.result)).toEqual(['1', '2', '3', '4', '5'])
      expect(liveIds(hook.result)).toEqual(['2', '5'])
      expect(streams.mock.calls.at(-1)?.[0]).toEqual(['1', '2', '3', '4', '5'])
    })

    it('a reload of the follow list keeps the pages loaded with "load more"', async () => {
      chainedPages(6)
      streams.mockResolvedValue([])
      const hook = renderHook(() => useFollowedChannels(USER))
      await settle()
      await act(async () => {
        await hook.result.current.loadMore()
      })
      expect(ids(hook.result)).toEqual(['1', '2', '3', '4', '5'])

      await advance(FOLLOWS_REFRESH_MS)

      expect(ids(hook.result)).toEqual(['1', '2', '3', '4', '5'])
      expect(hook.result.current.cursor).toBe('c5')
    })
  })
})
