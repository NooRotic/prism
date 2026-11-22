import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useYoutubeLive } from '../useYoutubeLive'
import { fetchLiveSubscriptions } from '../../lib/youtubeLive'
import { setSubscriptions } from '../../lib/catchupStore'
import { markQuotaReached, resetQuotaForTests } from '../../lib/youtubeQuota'
import { checkAllowed, recordCheck } from '../../lib/youtubeLiveBudget'

vi.mock('../../lib/youtubeLive', () => ({ fetchLiveSubscriptions: vi.fn() }))
vi.mock('../../lib/youtubeApi', () => ({ isYouTubeApiAvailable: () => true }))
// The subscription count is driven by the test, so "subscriptions arrive after the rail mounted" can be shown.
let subscriptionCount = 1
vi.mock('../useYoutubeAccount', () => ({ useYoutubeAccount: () => ({ subscriptionCount }) }))

const subs = [{ id: 'UC1', title: 'One' }]
const AUTO_KEY = 'prism_youtube_live_auto'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetQuotaForTests()
  subscriptionCount = 1
  setSubscriptions(subs)
  vi.mocked(fetchLiveSubscriptions).mockReset()
  vi.mocked(fetchLiveSubscriptions).mockResolvedValue({ status: 'ok', streams: [] })
})

describe('useYoutubeLive: the automatic first check of a visit', () => {
  it('checks automatically once on the first mount of a visit', async () => {
    renderHook(() => useYoutubeLive())
    await waitFor(() => expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1))
    expect(sessionStorage.getItem(AUTO_KEY)).not.toBeNull()
  })

  it('a remount in the same tab (a reload) does not check again', async () => {
    const first = renderHook(() => useYoutubeLive())
    await waitFor(() => expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1))
    first.unmount()
    localStorage.removeItem('prism_youtube_live_checks') // even with the allowance free again
    renderHook(() => useYoutubeLive())
    await act(async () => {})
    expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('waits for subscriptions, then checks once', async () => {
    subscriptionCount = 0
    const { rerender } = renderHook(() => useYoutubeLive())
    await act(async () => {})
    expect(fetchLiveSubscriptions).not.toHaveBeenCalled()
    subscriptionCount = 1
    rerender()
    await waitFor(() => expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1))
    rerender()
    await act(async () => {})
    expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('obeys the allowance and does not retry later in the visit', async () => {
    recordCheck(Date.now() - 60_000)
    renderHook(() => useYoutubeLive())
    await act(async () => {})
    expect(fetchLiveSubscriptions).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(AUTO_KEY)).not.toBeNull()
  })

  it('is skipped when the quota is reached', async () => {
    markQuotaReached()
    renderHook(() => useYoutubeLive())
    await act(async () => {})
    expect(fetchLiveSubscriptions).not.toHaveBeenCalled()
  })

  it('counts toward the checks allowed', async () => {
    renderHook(() => useYoutubeLive())
    await waitFor(() => expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1))
    expect(checkAllowed()).toMatchObject({ ok: false, reason: 'cooldown' })
  })
})
