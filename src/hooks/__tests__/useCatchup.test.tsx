import { act, renderHook, waitFor } from '@testing-library/react'
import type { CatchupVideo } from '../../lib/catchup'
import { setSubscriptions, getSubscriptions, getWatchLater, setWatchLater, recordWatched } from '../../lib/catchupStore'
import { CatchupApiError, describeVideos, fetchSubscriptionLane, listSubscriptions } from '../../lib/catchupApi'
import { fetchRelatedLane } from '../../lib/mixRelated'
import { GoogleAuthError, requestYoutubeReadToken } from '../../lib/googleYoutubeAuth'
import { useCatchup } from '../useCatchup'

vi.mock('../../lib/catchupApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catchupApi')>()
  return { ...actual, fetchSubscriptionLane: vi.fn(), describeVideos: vi.fn(), listSubscriptions: vi.fn() }
})
vi.mock('../../lib/mixRelated', () => ({ fetchRelatedLane: vi.fn() }))
vi.mock('../../lib/googleYoutubeAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/googleYoutubeAuth')>()
  return { ...actual, requestYoutubeReadToken: vi.fn() }
})

const vid = (id: string): CatchupVideo => ({ id, title: id, channel: 'c', publishedAt: '', durationSec: 60, thumbnail: '' })
const mS = vi.mocked(fetchSubscriptionLane)
const mW = vi.mocked(describeVideos)
const mR = vi.mocked(fetchRelatedLane)

beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
  mS.mockResolvedValue([])
  mW.mockResolvedValue([])
  mR.mockResolvedValue([])
})

describe('useCatchup', () => {
  it('blends the three lanes 2:1:1 and tags each video', async () => {
    setSubscriptions([{ id: 'UCa', title: 'A' }])
    setWatchLater(['w1w1w1w1w1w'])
    recordWatched('seedvideo01')
    mS.mockResolvedValue([vid('s1'), vid('s2'), vid('s3')])
    mW.mockResolvedValue([vid('w1')])
    mR.mockResolvedValue([vid('r1')])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.queue.map((v) => v.id)).toEqual(['s1', 's2', 'w1', 'r1', 's3'])
    expect(result.current.queue.map((v) => v.tag).join('')).toBe('SSWRS')
    expect(result.current.subscriptionCount).toBe(1)
    expect(result.current.watchLaterCount).toBe(1)
  })

  it('does not call a lane that has nothing to start from', async () => {
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mS).not.toHaveBeenCalled()
    expect(mW).not.toHaveBeenCalled()
    expect(mR).not.toHaveBeenCalled()
    expect(result.current.queue).toEqual([])
  })

  it('keeps the other lanes and explains it when the subscription lane runs out of quota', async () => {
    setSubscriptions([{ id: 'UCa', title: 'A' }])
    setWatchLater(['w1w1w1w1w1w'])
    mS.mockRejectedValue(new CatchupApiError('quota', 403, 'quotaExceeded'))
    mW.mockResolvedValue([vid('w1')])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.queue.map((v) => v.id)).toEqual(['w1'])
    expect(result.current.notices.join(' ')).toMatch(/quota/i)
  })

  it('says so when a Mix gives no related videos', async () => {
    recordWatched('seedvideo01')
    mR.mockResolvedValue([])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.notices.join(' ')).toMatch(/related/i)
  })

  it('leaves stored subscriptions alone when the Google sign-in is declined', async () => {
    setSubscriptions([{ id: 'UCold', title: 'Old' }])
    vi.mocked(requestYoutubeReadToken).mockRejectedValue(new GoogleAuthError('closed', 'closed'))
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.importSubscriptions()
    })
    expect(getSubscriptions()).toEqual([{ id: 'UCold', title: 'Old' }])
    expect(result.current.notices.length).toBeGreaterThan(0)
    expect(vi.mocked(listSubscriptions)).not.toHaveBeenCalled()
  })

  it('stores the imported subscriptions and rebuilds the feed', async () => {
    vi.mocked(requestYoutubeReadToken).mockResolvedValue('tok')
    vi.mocked(listSubscriptions).mockResolvedValue([{ id: 'UCnew', title: 'New' }])
    mS.mockResolvedValue([vid('s1')])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.importSubscriptions()
    })
    expect(getSubscriptions()).toEqual([{ id: 'UCnew', title: 'New' }])
    expect(result.current.subscriptionCount).toBe(1)
    expect(result.current.queue.map((v) => v.id)).toEqual(['s1'])
  })

  it('stores the video ids found in pasted Watch Later text', async () => {
    mW.mockResolvedValue([vid('aaaaaaaaaaa')])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.savePastedWatchLater('https://youtu.be/aaaaaaaaaaa\nnot a link')
    })
    expect(getWatchLater()).toEqual(['aaaaaaaaaaa'])
    expect(result.current.watchLaterCount).toBe(1)
    expect(result.current.queue.map((v) => v.id)).toEqual(['aaaaaaaaaaa'])
  })
})
