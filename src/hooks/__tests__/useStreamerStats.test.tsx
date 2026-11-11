import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TwitchUser } from '../../types/twitch'
import { useStreamerHistory } from '../useStreamerHistory'
import { useStreamerNumbers } from '../useStreamerNumbers'
import { isStreamerTier, useStreamerStats } from '../useStreamerStats'
import { useTrackerSummary } from '../useTrackerSummary'

vi.mock('../useTrackerSummary', () => ({ useTrackerSummary: vi.fn() }))
vi.mock('../useStreamerNumbers', () => ({ useStreamerNumbers: vi.fn() }))
vi.mock('../useStreamerHistory', () => ({ useStreamerHistory: vi.fn() }))

const mockTracker = vi.mocked(useTrackerSummary)
const mockNumbers = vi.mocked(useStreamerNumbers)
const mockHistory = vi.mocked(useStreamerHistory)

const user = (broadcaster_type: TwitchUser['broadcaster_type']) =>
  ({ id: '42', login: 'streamer', broadcaster_type }) as TwitchUser

const trackerResult = { summary: null, loading: true, unavailable: false }
const numbersResult = {
  followers: { data: null, loading: true, error: null },
  subscribers: { data: null, loading: true, error: null },
}
const historyResult = {
  followers: { data: null, loading: true, error: null },
  videos: { data: null, loading: true, error: null },
}

describe('isStreamerTier', () => {
  it.each([
    ['affiliate', true],
    ['partner', true],
    ['', false],
  ] as const)('is %j -> %s', (type, expected) => {
    expect(isStreamerTier(user(type))).toBe(expected)
  })

  it('is false for no user', () => {
    expect(isStreamerTier(null)).toBe(false)
  })
})

describe('useStreamerStats', () => {
  const onExpired = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockTracker.mockReturnValue(trackerResult)
    mockNumbers.mockReturnValue(numbersResult)
    mockHistory.mockReturnValue(historyResult)
  })

  it('asks for an enabled affiliate and returns the three results', () => {
    const { result } = renderHook(() => useStreamerStats(user('affiliate'), true, onExpired))
    expect(mockTracker).toHaveBeenLastCalledWith('streamer')
    expect(mockNumbers).toHaveBeenLastCalledWith('42', onExpired)
    expect(mockHistory).toHaveBeenLastCalledWith('42', onExpired)
    expect(result.current).toEqual({ tracker: trackerResult, numbers: numbersResult, history: historyResult })
  })

  it('makes no request for a user who is not an affiliate or partner', () => {
    renderHook(() => useStreamerStats(user(''), true, onExpired))
    expect(mockTracker).toHaveBeenLastCalledWith(null)
    expect(mockNumbers).toHaveBeenLastCalledWith(null, onExpired)
    expect(mockHistory).toHaveBeenLastCalledWith(null, onExpired)
  })

  it('makes no request while disabled', () => {
    renderHook(() => useStreamerStats(user('partner'), false, onExpired))
    expect(mockTracker).toHaveBeenLastCalledWith(null)
    expect(mockNumbers).toHaveBeenLastCalledWith(null, onExpired)
    expect(mockHistory).toHaveBeenLastCalledWith(null, onExpired)
  })

  it('makes no request without a user, but still calls the hooks so their order never changes', () => {
    renderHook(() => useStreamerStats(null, true, onExpired))
    expect(mockTracker).toHaveBeenLastCalledWith(null)
    expect(mockNumbers).toHaveBeenLastCalledWith(null, onExpired)
    expect(mockHistory).toHaveBeenLastCalledWith(null, onExpired)
  })
})
