import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useYourStats } from '../useYourStats'

// Mock every Twitch API function the hook calls. We import the mocked
// module after vi.mock so vi.mocked() gives strong types. SessionExpiredError
// is a real class exported from the same module — we use vi.importActual to
// preserve it while still mocking the wrappers.
vi.mock('../../lib/twitchApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/twitchApi')>(
    '../../lib/twitchApi',
  )
  return {
    ...actual,
    getBroadcasterFollowerCount: vi.fn(),
    getBroadcasterSubscriptions: vi.fn(),
    getBroadcasterGoals: vi.fn(),
    getBroadcasterVIPs: vi.fn(),
    getHypeTrainEvents: vi.fn(),
    getBroadcasterPolls: vi.fn(),
    getBroadcasterPredictions: vi.fn(),
    getBitsLeaderboard: vi.fn(),
  }
})

import {
  getBroadcasterFollowerCount,
  getBroadcasterSubscriptions,
  getBroadcasterGoals,
  getBroadcasterVIPs,
  getHypeTrainEvents,
  getBroadcasterPolls,
  getBroadcasterPredictions,
  getBitsLeaderboard,
  SessionExpiredError,
} from '../../lib/twitchApi'

const mockedFollowers = vi.mocked(getBroadcasterFollowerCount)
const mockedSubs = vi.mocked(getBroadcasterSubscriptions)
const mockedGoals = vi.mocked(getBroadcasterGoals)
const mockedVIPs = vi.mocked(getBroadcasterVIPs)
const mockedHype = vi.mocked(getHypeTrainEvents)
const mockedPolls = vi.mocked(getBroadcasterPolls)
const mockedPreds = vi.mocked(getBroadcasterPredictions)
const mockedBits = vi.mocked(getBitsLeaderboard)

function installSuccessMocks() {
  mockedFollowers.mockResolvedValue(42_000)
  mockedSubs.mockResolvedValue({
    data: [
      {
        broadcaster_id: '1',
        broadcaster_login: 'me',
        broadcaster_name: 'Me',
        gifter_id: '',
        gifter_login: '',
        gifter_name: '',
        is_gift: false,
        tier: '1000',
        plan_name: 'Channel Subscription',
        user_id: '10',
        user_login: 'fan1',
        user_name: 'Fan1',
      },
    ],
    total: 120,
    points: 150,
  })
  mockedGoals.mockResolvedValue([])
  mockedVIPs.mockResolvedValue([])
  mockedHype.mockResolvedValue([])
  mockedPolls.mockResolvedValue([])
  mockedPreds.mockResolvedValue([])
  mockedBits.mockResolvedValue([])
}

describe('useYourStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('is a no-op when broadcasterId is null', () => {
    installSuccessMocks()
    const { result } = renderHook(() => useYourStats(null, false))
    expect(result.current.stats.followerCount.data).toBeNull()
    expect(result.current.stats.followerCount.loading).toBe(false)
    expect(mockedFollowers).not.toHaveBeenCalled()
  })

  it('fetches only follower count for non-streamers', async () => {
    installSuccessMocks()
    const { result } = renderHook(() => useYourStats('42', false))

    await waitFor(() => {
      expect(result.current.stats.followerCount.data).toBe(42_000)
    })

    expect(mockedFollowers).toHaveBeenCalledWith('42')
    expect(mockedSubs).not.toHaveBeenCalled()
    expect(mockedGoals).not.toHaveBeenCalled()
    expect(mockedVIPs).not.toHaveBeenCalled()
    expect(mockedHype).not.toHaveBeenCalled()
    expect(mockedPolls).not.toHaveBeenCalled()
    expect(mockedPreds).not.toHaveBeenCalled()
    expect(mockedBits).not.toHaveBeenCalled()
  })

  it('fetches all sections in parallel for streamers', async () => {
    installSuccessMocks()
    const { result } = renderHook(() => useYourStats('42', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockedFollowers).toHaveBeenCalledOnce()
    expect(mockedSubs).toHaveBeenCalledOnce()
    expect(mockedGoals).toHaveBeenCalledOnce()
    expect(mockedVIPs).toHaveBeenCalledOnce()
    expect(mockedHype).toHaveBeenCalledOnce()
    expect(mockedPolls).toHaveBeenCalledOnce()
    expect(mockedPreds).toHaveBeenCalledOnce()
    expect(mockedBits).toHaveBeenCalledOnce()
  })

  it('maps subscription response into the simplified section shape', async () => {
    installSuccessMocks()
    const { result } = renderHook(() => useYourStats('42', true))

    await waitFor(() => {
      expect(result.current.stats.subscribers.data).not.toBeNull()
    })

    const subs = result.current.stats.subscribers.data
    expect(subs).toMatchObject({
      total: 120,
      points: 150,
    })
    expect(subs?.recent).toHaveLength(1)
    expect(subs?.recent[0]).toMatchObject({
      user_name: 'Fan1',
      tier: '1000',
    })
  })

  it('captures per-section errors without breaking other sections', async () => {
    installSuccessMocks()
    mockedGoals.mockRejectedValue(new Error('Goals endpoint hiccup'))

    const { result } = renderHook(() => useYourStats('42', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    // Goals section has the error
    expect(result.current.stats.goals.error).toContain('Goals endpoint hiccup')
    expect(result.current.stats.goals.data).toBeNull()

    // But followers still succeeded
    expect(result.current.stats.followerCount.data).toBe(42_000)
    expect(result.current.stats.followerCount.error).toBeNull()

    // And sessionError is false — not every section failed
    expect(result.current.sessionError).toBe(false)
  })

  it('reports sessionError when every attempted section failed', async () => {
    const err = new Error('boom')
    mockedFollowers.mockRejectedValue(err)
    mockedSubs.mockRejectedValue(err)
    mockedGoals.mockRejectedValue(err)
    mockedVIPs.mockRejectedValue(err)
    mockedHype.mockRejectedValue(err)
    mockedPolls.mockRejectedValue(err)
    mockedPreds.mockRejectedValue(err)
    mockedBits.mockRejectedValue(err)

    const { result } = renderHook(() => useYourStats('42', true))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
    await waitFor(() => {
      expect(result.current.sessionError).toBe(true)
    })
  })

  it('invokes handleAuthError on SessionExpiredError', async () => {
    const handleAuthError = vi.fn()
    installSuccessMocks()
    mockedFollowers.mockRejectedValue(new SessionExpiredError())

    const { result } = renderHook(() =>
      useYourStats('42', false, { handleAuthError }),
    )

    await waitFor(() => {
      expect(handleAuthError).toHaveBeenCalled()
    })
    expect(result.current.stats.followerCount.error).toBeTruthy()
  })
})
