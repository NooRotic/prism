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

describe('useCatchup: a slow lane does not hold the others back', () => {
  it('shows the subscription videos while the related lane is still loading', async () => {
    setSubscriptions([{ id: 'UCa', title: 'A' }])
    recordWatched('seedvideo01')
    mS.mockResolvedValue([vid('s1')])
    mR.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.queue.map((v) => v.id)).toEqual(['s1']))
    expect(result.current.status).toBe('loading')
  })
})

describe('useCatchup: failures say what is wrong', () => {
  it('says the API key is missing when a lane fails for that reason', async () => {
    setSubscriptions([{ id: 'UCa', title: 'A' }])
    mS.mockRejectedValue(new CatchupApiError('no key', 0, 'noKey'))
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.notices.join(' ')).toMatch(/API key/i)
  })

  it('blames the quota, not the paste, when Watch Later runs out of quota', async () => {
    setWatchLater(['w1w1w1w1w1w'])
    mW.mockRejectedValue(new CatchupApiError('quota', 403, 'quotaExceeded'))
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.notices.join(' ')).toMatch(/quota/i)
    expect(result.current.notices.join(' ')).not.toMatch(/pasted/i)
  })
})

describe('useCatchup: no recent videos to start the related lane from', () => {
  it('says nothing about related videos, since none were looked for', async () => {
    setSubscriptions([{ id: 'UCa', title: 'A' }])
    mS.mockResolvedValue([vid('s1')])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.notices).toEqual([])
  })
})

describe('useCatchup: first paint', () => {
  it('starts as loading, so the empty-state text does not flash before the first load', async () => {
    const seen: string[] = []
    const { result } = renderHook(() => {
      const c = useCatchup()
      seen.push(c.status)
      return c
    })
    expect(seen[0]).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
  })
})

describe('useCatchup: forced refresh', () => {
  it('asks the subscription lane to skip its cache', async () => {
    setSubscriptions([{ id: 'UCa', title: 'A' }])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.refresh({ force: true })
    })
    expect(mS).toHaveBeenLastCalledWith([{ id: 'UCa', title: 'A' }], { force: true })
  })
})

describe('useCatchup: pasting Watch Later', () => {
  it('keeps the saved list and says so when nothing in the paste is a video link', async () => {
    setWatchLater(['aaaaaaaaaaa'])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.savePastedWatchLater('Some Video Title\nAnother Title')
    })
    expect(getWatchLater()).toEqual(['aaaaaaaaaaa'])
    expect(result.current.notices.join(' ')).toMatch(/no video links/i)
  })

  it('tells the owner how many videos were saved', async () => {
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.savePastedWatchLater('https://youtu.be/aaaaaaaaaaa https://youtu.be/bbbbbbbbbbb')
    })
    expect(result.current.notices.join(' ')).toMatch(/saved 2 watch later videos/i)
  })

  it('clears the list on request', async () => {
    setWatchLater(['aaaaaaaaaaa'])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(async () => {
      await result.current.clearWatchLater()
    })
    expect(getWatchLater()).toEqual([])
    expect(result.current.watchLaterCount).toBe(0)
  })
})

describe('useCatchup: import in progress', () => {
  it('reports importing while Google is open, and ignores a second click', async () => {
    let finish!: (t: string) => void
    vi.mocked(requestYoutubeReadToken).mockReturnValue(new Promise<string>((r) => (finish = r)))
    vi.mocked(listSubscriptions).mockResolvedValue([])
    const { result } = renderHook(() => useCatchup())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let first!: Promise<void>
    act(() => {
      first = result.current.importSubscriptions()
    })
    await waitFor(() => expect(result.current.importing).toBe(true))
    await act(async () => {
      await result.current.importSubscriptions()
    })
    expect(vi.mocked(requestYoutubeReadToken)).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish('tok')
      await first
    })
    expect(result.current.importing).toBe(false)
  })
})
