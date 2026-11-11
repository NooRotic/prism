import { renderHook, waitFor } from '@testing-library/react'
import { useTrackerSummary } from '../useTrackerSummary'
import { fetchTrackerSummary, trackerUnavailable, type TrackerSummary } from '../../lib/twitchTracker'

vi.mock('../../lib/twitchTracker', () => ({ fetchTrackerSummary: vi.fn(), trackerUnavailable: vi.fn() }))

const mockFetch = vi.mocked(fetchTrackerSummary)
const mockUnavailable = vi.mocked(trackerUnavailable)

const SUMMARY: TrackerSummary = {
  rank: 3290,
  minutesStreamed: 652,
  avgViewers: 1226,
  maxViewers: 2894,
  hoursWatched: 13314,
  followersGained: 13874,
  followersTotal: 2484840,
}

describe('useTrackerSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUnavailable.mockReturnValue(false)
  })

  it('makes no request without a login', () => {
    const { result } = renderHook(() => useTrackerSummary(null))

    expect(result.current).toEqual({ summary: null, loading: false, unavailable: false })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('is loading first, then holds the summary', async () => {
    mockFetch.mockResolvedValue(SUMMARY)
    const { result } = renderHook(() => useTrackerSummary('streamer'))

    expect(result.current).toEqual({ summary: null, loading: true, unavailable: false })
    await waitFor(() => expect(result.current).toEqual({ summary: SUMMARY, loading: false, unavailable: false }))
    expect(mockFetch).toHaveBeenCalledWith('streamer')
  })

  it('stops loading with no summary, and not unavailable, when TwitchTracker answered that it knows nothing', async () => {
    mockFetch.mockResolvedValue(null)
    mockUnavailable.mockReturnValue(false)
    const { result } = renderHook(() => useTrackerSummary('streamer'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toBeNull()
    expect(result.current.unavailable).toBe(false)
  })

  it('says unavailable when there is no summary because no answer could be had', async () => {
    mockFetch.mockResolvedValue(null)
    mockUnavailable.mockReturnValue(true)
    const { result } = renderHook(() => useTrackerSummary('streamer'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current).toEqual({ summary: null, loading: false, unavailable: true })
    expect(mockUnavailable).toHaveBeenCalledWith('streamer')
  })

  it('never says unavailable when it has a summary', async () => {
    mockFetch.mockResolvedValue(SUMMARY)
    mockUnavailable.mockReturnValue(true)
    const { result } = renderHook(() => useTrackerSummary('streamer'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.unavailable).toBe(false)
  })

  it('asks once per login, and again when the login changes', async () => {
    mockFetch.mockResolvedValue(SUMMARY)
    const { result, rerender } = renderHook(({ login }) => useTrackerSummary(login), {
      initialProps: { login: 'one' as string | null },
    })
    await waitFor(() => expect(result.current.summary).toEqual(SUMMARY))

    rerender({ login: 'one' })
    expect(mockFetch).toHaveBeenCalledTimes(1)

    rerender({ login: 'two' })
    expect(result.current).toEqual({ summary: null, loading: true, unavailable: false })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('drops the summary when the login goes back to null', async () => {
    mockFetch.mockResolvedValue(SUMMARY)
    const { result, rerender } = renderHook(({ login }) => useTrackerSummary(login), {
      initialProps: { login: 'one' as string | null },
    })
    await waitFor(() => expect(result.current.summary).toEqual(SUMMARY))

    rerender({ login: null })

    expect(result.current).toEqual({ summary: null, loading: false, unavailable: false })
  })

  it('treats a rejected request as no answer: unavailable', async () => {
    mockFetch.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useTrackerSummary('streamer'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.summary).toBeNull()
    expect(result.current.unavailable).toBe(true)
  })
})
