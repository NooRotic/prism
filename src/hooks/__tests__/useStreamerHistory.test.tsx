import { renderHook, waitFor } from '@testing-library/react'
import { clearHistoryCache, useStreamerHistory } from '../useStreamerHistory'
import { getFollowerDates, getVideos, SessionExpiredError } from '../../lib/twitchApi'
import type { TwitchVideo } from '../../types/twitch'

vi.mock('../../lib/twitchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/twitchApi')>()
  return { ...actual, getFollowerDates: vi.fn(), getVideos: vi.fn() }
})

const mockDates = vi.mocked(getFollowerDates)
const mockVideos = vi.mocked(getVideos)

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const NOW = new Date(2026, 10, 11, 15, 30, 0).getTime()
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function archive(startedAgoMs: number, duration: string, views: number): TwitchVideo {
  return {
    id: `v${startedAgoMs}`,
    stream_id: 's',
    user_id: '99',
    user_login: 'streamer',
    user_name: 'Streamer',
    title: 'a stream',
    description: '',
    created_at: ago(startedAgoMs),
    published_at: ago(startedAgoMs),
    url: '',
    thumbnail_url: '',
    viewable: 'public',
    view_count: views,
    language: 'en',
    type: 'archive',
    duration,
  }
}

const FOLLOWS = { dates: [ago(2 * 60 * MINUTE), ago(26 * 60 * MINUTE)], total: 5000, reachedCap: false }

let nowSpy: ReturnType<typeof vi.spyOn>

async function settled(result: { current: ReturnType<typeof useStreamerHistory> }) {
  await waitFor(() => {
    expect(result.current.followers.loading).toBe(false)
    expect(result.current.videos.loading).toBe(false)
  })
}

describe('useStreamerHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearHistoryCache()
    nowSpy = vi.spyOn(Date, 'now').mockReturnValue(NOW)
    mockDates.mockResolvedValue(FOLLOWS)
    mockVideos.mockResolvedValue([archive(1 * DAY, '2h', 40)])
  })

  afterEach(() => {
    nowSpy.mockRestore()
  })

  it('makes no request without an id', () => {
    const { result } = renderHook(() => useStreamerHistory(null, vi.fn()))

    expect(result.current.followers).toEqual({ data: null, loading: false, error: null })
    expect(result.current.videos).toEqual({ data: null, loading: false, error: null })
    expect(mockDates).not.toHaveBeenCalled()
    expect(mockVideos).not.toHaveBeenCalled()
  })

  it('reads the last 30 days of followers, at most 10 pages, and buckets them by day', async () => {
    const { result } = renderHook(() => useStreamerHistory('99', vi.fn()))

    expect(result.current.followers.loading).toBe(true)
    await settled(result)

    expect(mockDates).toHaveBeenCalledWith('99', NOW - 30 * DAY, 10)
    const data = result.current.followers.data
    expect(data?.source).toBe('twitch')
    expect(data?.total).toBe(5000)
    expect(data?.reachedCap).toBe(false)
    expect(data?.buckets).toHaveLength(30)
    expect(data?.buckets.reduce((sum, b) => sum + (b.value ?? 0), 0)).toBe(2)
    expect(data?.buckets.every((b) => b.value !== null)).toBe(true)
  })

  it('blanks the days before where the follower read stopped when it hit its page cap', async () => {
    mockDates.mockResolvedValue({
      dates: [ago(1 * DAY), ago(5 * DAY)],
      total: 90000,
      reachedCap: true,
    })
    const { result } = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(result)

    const data = result.current.followers.data
    expect(data?.reachedCap).toBe(true)
    const buckets = data?.buckets ?? []
    expect(buckets[0].value).toBeNull()
    expect(buckets[29].value).not.toBeNull()
    // Days before the earliest follow read are unknown; the days since are counted.
    expect(buckets.filter((b) => b.value === null).length).toBeGreaterThan(20)
    expect(buckets.filter((b) => b.value === null).length).toBeLessThan(30)
  })

  it('reads the broadcast recordings and turns them into views, hours and how far back they go', async () => {
    mockVideos.mockResolvedValue([archive(1 * DAY, '2h', 40), archive(9 * DAY, '1h30m', 25)])
    const { result } = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(result)

    expect(mockVideos).toHaveBeenCalledWith('99', 100, { type: 'archive' })
    const data = result.current.videos.data
    expect(data?.source).toBe('twitch')
    expect(data?.views.map((p) => p.value)).toEqual([25, 40])
    expect(data?.hours).toHaveLength(30)
    expect(data?.hours.reduce((sum, b) => sum + (b.value ?? 0), 0)).toBeCloseTo(3.5, 10)
    expect(data?.coverageDays).toBe(9)
  })

  it('lets one section fail without the other', async () => {
    mockDates.mockRejectedValue(new Error('Twitch API error: 400 bad'))
    const { result } = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(result)

    expect(result.current.followers.data).toBeNull()
    expect(result.current.followers.error).toContain('400')
    expect(result.current.videos.data?.views).toHaveLength(1)
    expect(result.current.videos.error).toBeNull()
  })

  it.each([
    ['followers', () => mockDates.mockRejectedValue(new SessionExpiredError())],
    ['recordings', () => mockVideos.mockRejectedValue(new SessionExpiredError())],
  ])('reports an expired session (a missing-scope 401 too) from the %s call', async (_name, arrange) => {
    arrange()
    const onSessionExpired = vi.fn()
    renderHook(() => useStreamerHistory('99', onSessionExpired))

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
  })

  it('makes no new request for a second mount within 15 minutes, and asks again after 16', async () => {
    const first = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(first.result)
    first.unmount()

    nowSpy.mockReturnValue(NOW + 14 * MINUTE)
    const second = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(second.result)
    second.unmount()
    expect(second.result.current.followers.data?.total).toBe(5000)
    expect(mockDates).toHaveBeenCalledTimes(1)
    expect(mockVideos).toHaveBeenCalledTimes(1)

    nowSpy.mockReturnValue(NOW + 16 * MINUTE)
    const third = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(third.result)

    expect(mockDates).toHaveBeenCalledTimes(2)
    expect(mockVideos).toHaveBeenCalledTimes(2)
  })

  it('draws the days of the moment it is shown, not of the first fetch', async () => {
    nowSpy.mockReturnValue(new Date(2026, 10, 11, 23, 55, 0).getTime())
    const first = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(first.result)
    expect(first.result.current.followers.data?.buckets.at(-1)?.at).toBe(new Date(2026, 10, 11).getTime())
    first.unmount()

    // Ten minutes later, past local midnight: the cached answer is reused but today has moved on.
    nowSpy.mockReturnValue(new Date(2026, 10, 12, 0, 5, 0).getTime())
    const second = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(second.result)

    expect(mockDates).toHaveBeenCalledTimes(1)
    expect(second.result.current.followers.data?.buckets.at(-1)?.at).toBe(new Date(2026, 10, 12).getTime())
    expect(second.result.current.videos.data?.hours.at(-1)?.at).toBe(new Date(2026, 10, 12).getTime())
  })

  it('keeps one cache entry per streamer', async () => {
    const first = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(first.result)

    const other = renderHook(() => useStreamerHistory('100', vi.fn()))
    await settled(other.result)

    expect(mockDates).toHaveBeenCalledTimes(2)
    expect(mockDates).toHaveBeenLastCalledWith('100', NOW - 30 * DAY, 10)
  })

  it('shares one request between two mounts that start together', async () => {
    const a = renderHook(() => useStreamerHistory('99', vi.fn()))
    const b = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(a.result)
    await settled(b.result)

    expect(mockDates).toHaveBeenCalledTimes(1)
    expect(mockVideos).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failure, so the next mount tries again', async () => {
    mockDates.mockRejectedValueOnce(new Error('Twitch API error: 500'))
    const first = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(first.result)
    expect(first.result.current.followers.error).not.toBeNull()
    first.unmount()

    const second = renderHook(() => useStreamerHistory('99', vi.fn()))
    await settled(second.result)

    expect(mockDates).toHaveBeenCalledTimes(2)
    expect(second.result.current.followers.data?.total).toBe(5000)
  })

  it('never refetches while it stays mounted', async () => {
    const { result, rerender } = renderHook(() => useStreamerHistory('99', () => {}))
    await settled(result)

    rerender()
    nowSpy.mockReturnValue(NOW + 60 * MINUTE)
    rerender()

    expect(mockDates).toHaveBeenCalledTimes(1)
    expect(mockVideos).toHaveBeenCalledTimes(1)
  })

  it('shows loading, not the old streamer, when the id changes', async () => {
    const { result, rerender } = renderHook(({ id }) => useStreamerHistory(id, vi.fn()), {
      initialProps: { id: '99' as string | null },
    })
    await settled(result)

    mockDates.mockResolvedValue({ ...FOLLOWS, total: 7 })
    rerender({ id: '100' })

    expect(result.current.followers).toEqual({ data: null, loading: true, error: null })
    await waitFor(() => expect(result.current.followers.data?.total).toBe(7))
  })
})
