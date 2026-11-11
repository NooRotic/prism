import { renderHook, waitFor } from '@testing-library/react'
import { useStreamerNumbers } from '../useStreamerNumbers'
import { getBroadcasterFollowerCount, getBroadcasterSubscriptions, SessionExpiredError } from '../../lib/twitchApi'

vi.mock('../../lib/twitchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/twitchApi')>()
  return { ...actual, getBroadcasterFollowerCount: vi.fn(), getBroadcasterSubscriptions: vi.fn() }
})

const mockFollowers = vi.mocked(getBroadcasterFollowerCount)
const mockSubs = vi.mocked(getBroadcasterSubscriptions)

function subs(total: number) {
  return { data: [], total, points: total, pagination: undefined }
}

describe('useStreamerNumbers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('makes no request without an id and reports nothing loading', () => {
    const { result } = renderHook(() => useStreamerNumbers(null, vi.fn()))

    expect(result.current.followers).toEqual({ data: null, loading: false, error: null })
    expect(result.current.subscribers).toEqual({ data: null, loading: false, error: null })
    expect(mockFollowers).not.toHaveBeenCalled()
    expect(mockSubs).not.toHaveBeenCalled()
  })

  it('is loading first, then holds the follower and subscriber counts', async () => {
    mockFollowers.mockResolvedValue(1234)
    mockSubs.mockResolvedValue(subs(56))
    const { result } = renderHook(() => useStreamerNumbers('99', vi.fn()))

    expect(result.current.followers.loading).toBe(true)
    expect(result.current.subscribers.loading).toBe(true)

    await waitFor(() => expect(result.current.subscribers.loading).toBe(false))
    expect(result.current.followers).toEqual({ data: 1234, loading: false, error: null })
    expect(result.current.subscribers).toEqual({ data: 56, loading: false, error: null })
    expect(mockFollowers).toHaveBeenCalledWith('99')
    expect(mockSubs).toHaveBeenCalledWith('99', 1)
  })

  it('lets a failing subscriptions call leave the followers intact', async () => {
    mockFollowers.mockResolvedValue(1234)
    mockSubs.mockRejectedValue(new Error('Twitch API error: 403 not a partner'))
    const onSessionExpired = vi.fn()
    const { result } = renderHook(() => useStreamerNumbers('99', onSessionExpired))

    await waitFor(() => expect(result.current.subscribers.loading).toBe(false))
    await waitFor(() => expect(result.current.followers.loading).toBe(false))
    expect(result.current.followers).toEqual({ data: 1234, loading: false, error: null })
    expect(result.current.subscribers.data).toBeNull()
    expect(result.current.subscribers.error).toContain('403')
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('lets a failing follower call leave the subscribers intact', async () => {
    mockFollowers.mockRejectedValue(new Error('Twitch API error: 400'))
    mockSubs.mockResolvedValue(subs(56))
    const { result } = renderHook(() => useStreamerNumbers('99', vi.fn()))

    await waitFor(() => expect(result.current.followers.loading).toBe(false))
    await waitFor(() => expect(result.current.subscribers.loading).toBe(false))
    expect(result.current.followers.error).toContain('400')
    expect(result.current.subscribers).toEqual({ data: 56, loading: false, error: null })
  })

  it.each([
    ['followers', () => mockFollowers.mockRejectedValue(new SessionExpiredError()), () => mockSubs.mockResolvedValue(subs(1))],
    ['subscriptions', () => mockFollowers.mockResolvedValue(1), () => mockSubs.mockRejectedValue(new SessionExpiredError())],
  ])('reports an expired session from the %s call', async (_name, arrangeFollowers, arrangeSubs) => {
    arrangeFollowers()
    arrangeSubs()
    const onSessionExpired = vi.fn()
    renderHook(() => useStreamerNumbers('99', onSessionExpired))

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
  })

  it('does not refetch on a re-render, even with a new callback each time', async () => {
    mockFollowers.mockResolvedValue(1)
    mockSubs.mockResolvedValue(subs(2))
    const { result, rerender } = renderHook(() => useStreamerNumbers('99', () => {}))
    await waitFor(() => expect(result.current.subscribers.loading).toBe(false))

    rerender()
    rerender()

    expect(mockFollowers).toHaveBeenCalledTimes(1)
    expect(mockSubs).toHaveBeenCalledTimes(1)
  })

  it('shows loading, not the old streamer, when the id changes', async () => {
    mockFollowers.mockResolvedValue(1)
    mockSubs.mockResolvedValue(subs(2))
    const { result, rerender } = renderHook(({ id }) => useStreamerNumbers(id, vi.fn()), {
      initialProps: { id: '1' as string | null },
    })
    await waitFor(() => expect(result.current.followers.data).toBe(1))

    mockFollowers.mockResolvedValue(7)
    rerender({ id: '2' })

    expect(result.current.followers).toEqual({ data: null, loading: true, error: null })
    await waitFor(() => expect(result.current.followers.data).toBe(7))
  })

  it('drops the numbers when the id goes back to null', async () => {
    mockFollowers.mockResolvedValue(1)
    mockSubs.mockResolvedValue(subs(2))
    const { result, rerender } = renderHook(({ id }) => useStreamerNumbers(id, vi.fn()), {
      initialProps: { id: '1' as string | null },
    })
    await waitFor(() => expect(result.current.followers.data).toBe(1))

    rerender({ id: null })

    expect(result.current.followers).toEqual({ data: null, loading: false, error: null })
  })
})
