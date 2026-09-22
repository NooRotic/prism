import { renderHook, waitFor } from '@testing-library/react'
import { useCategoryRail } from '../useCategoryRail'
import { getStreamsByGameId } from '../../lib/twitchApi'

vi.mock('../../lib/twitchApi', () => ({
  getStreamsByGameId: vi.fn(),
}))

const mockedGetStreams = vi.mocked(getStreamsByGameId)

/** Descending viewers: s0 = 1000, s1 = 990, ... so order is unambiguous. */
function pool(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `stream${i}`,
    user_id: `${i}`,
    user_login: `user${i}`,
    user_name: `User ${i}`,
    game_id: '509658',
    game_name: 'Just Chatting',
    type: 'live' as const,
    title: `Stream ${i}`,
    viewer_count: 1000 - i * 10,
    started_at: '2026-09-22T00:00:00Z',
    language: 'en',
    thumbnail_url: '',
    is_mature: false,
    tags: [],
  }))
}

describe('useCategoryRail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches nothing when there is no category in context', () => {
    renderHook(() => useCategoryRail(null, null))
    expect(mockedGetStreams).not.toHaveBeenCalled()
  })

  it('puts the top 3 by viewer count first, in order', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams.length).toBeGreaterThan(0))
    expect(result.current.streams.slice(0, 3).map((s) => s.user_id)).toEqual([
      '0',
      '1',
      '2',
    ])
  })

  it('returns exactly 8 entries when the pool is large enough', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams).toHaveLength(8))
  })

  it('excludes the currently-playing channel even when it tops the chart', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result } = renderHook(() => useCategoryRail('509658', '0'))

    await waitFor(() => expect(result.current.streams).toHaveLength(8))
    expect(result.current.streams.map((s) => s.user_id)).not.toContain('0')
    // Exclusion happens before ranking, so the top 3 close ranks rather
    // than leaving a hole.
    expect(result.current.streams.slice(0, 3).map((s) => s.user_id)).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('samples the remainder disjointly from the top 3, drawn from the pool', async () => {
    const source = pool(30)
    mockedGetStreams.mockResolvedValue(source as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams).toHaveLength(8))
    const ids = result.current.streams.map((s) => s.user_id)
    const top = ids.slice(0, 3)
    const sample = ids.slice(3)

    expect(new Set(ids).size).toBe(8)
    expect(sample.some((id) => top.includes(id))).toBe(false)
    const sourceIds = source.map((s) => s.user_id)
    expect(sample.every((id) => sourceIds.includes(id))).toBe(true)
  })

  it('keeps the same entries across re-renders — the rail must not reshuffle', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result, rerender } = renderHook(() => useCategoryRail('509658', null))
    await waitFor(() => expect(result.current.streams).toHaveLength(8))

    const first = result.current.streams.map((s) => s.user_id)
    rerender()
    rerender()
    rerender()

    expect(result.current.streams.map((s) => s.user_id)).toEqual(first)
  })

  it('returns everything available when the pool is smaller than the cap', async () => {
    mockedGetStreams.mockResolvedValue(pool(5) as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams).toHaveLength(5))
  })

  it('surfaces an error and an empty list when the fetch fails', async () => {
    mockedGetStreams.mockRejectedValue(new Error('Twitch API error: 500'))

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.streams).toEqual([])
  })
})
