import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useYoutubeLive } from '../useYoutubeLive'
import { fetchLiveSubscriptions } from '../../lib/youtubeLive'
import { setSubscriptions } from '../../lib/catchupStore'
import { markQuotaReached, resetQuotaForTests } from '../../lib/youtubeQuota'
import { recordCheck } from '../../lib/youtubeLiveBudget'

vi.mock('../../lib/youtubeLive', () => ({ fetchLiveSubscriptions: vi.fn() }))
vi.mock('../../lib/youtubeApi', () => ({ isYouTubeApiAvailable: () => true }))

const stream = { channelId: 'UC1', channelTitle: 'One', videoId: 'v1', title: 't', viewerCount: 5, startedAt: null, avatarUrl: '' }
const subs = [{ id: 'UC1', title: 'One' }]

beforeEach(() => {
  localStorage.clear()
  resetQuotaForTests()
  vi.mocked(fetchLiveSubscriptions).mockReset()
})

describe('useYoutubeLive', () => {
  it('is unavailable without imported subscriptions, and never fetches', () => {
    const { result } = renderHook(() => useYoutubeLive())
    expect(result.current.available).toBe(false)
    expect(fetchLiveSubscriptions).not.toHaveBeenCalled()
  })

  it('does nothing until the viewer asks: nothing is fetched on mount', () => {
    setSubscriptions(subs)
    const { result } = renderHook(() => useYoutubeLive())
    expect(result.current.available).toBe(true)
    expect(result.current.streams).toEqual([])
    expect(result.current.checkedAt).toBeNull()
    expect(fetchLiveSubscriptions).not.toHaveBeenCalled()
  })

  it('check() fetches once, keeps the answer, and starts the cooldown', async () => {
    setSubscriptions(subs)
    vi.mocked(fetchLiveSubscriptions).mockResolvedValue({ status: 'ok', streams: [stream] })
    const { result } = renderHook(() => useYoutubeLive())
    await act(async () => {
      await result.current.check()
    })
    expect(result.current.streams).toEqual([stream])
    expect(result.current.status).toBe('ok')
    expect(result.current.checkedAt).not.toBeNull()
    expect(result.current.allowance).toMatchObject({ ok: false, reason: 'cooldown' })
    // A second click inside the hour does not reach YouTube.
    await act(async () => {
      await result.current.check()
    })
    expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('remembers the last answer after a reload, without spending a check', async () => {
    setSubscriptions(subs)
    vi.mocked(fetchLiveSubscriptions).mockResolvedValue({ status: 'ok', streams: [stream] })
    const first = renderHook(() => useYoutubeLive())
    await act(async () => {
      await first.result.current.check()
    })
    first.unmount()
    const again = renderHook(() => useYoutubeLive())
    expect(again.result.current.streams).toEqual([stream])
    expect(fetchLiveSubscriptions).toHaveBeenCalledTimes(1)
  })

  it('refuses while the cooldown from an earlier check is running', async () => {
    setSubscriptions(subs)
    recordCheck(Date.now() - 60_000)
    const { result } = renderHook(() => useYoutubeLive())
    await act(async () => {
      await result.current.check()
    })
    expect(fetchLiveSubscriptions).not.toHaveBeenCalled()
  })

  it('does not spend quota once YouTube has said the daily limit is used up', async () => {
    setSubscriptions(subs)
    markQuotaReached()
    const { result } = renderHook(() => useYoutubeLive())
    await act(async () => {
      await result.current.check()
    })
    expect(fetchLiveSubscriptions).not.toHaveBeenCalled()
    expect(result.current.quotaReached).toBe(true)
  })

  it('reports an error and keeps the previous streams when a check fails', async () => {
    setSubscriptions(subs)
    vi.mocked(fetchLiveSubscriptions).mockResolvedValueOnce({ status: 'ok', streams: [stream] })
    const { result } = renderHook(() => useYoutubeLive())
    await act(async () => {
      await result.current.check()
    })
    localStorage.removeItem('prism_youtube_live_checks') // let a second check through
    vi.mocked(fetchLiveSubscriptions).mockResolvedValueOnce({ status: 'error' })
    await act(async () => {
      await result.current.check()
    })
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.streams).toEqual([stream])
  })
})
