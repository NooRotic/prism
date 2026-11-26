import { getAccount, getSubscriptions, setAccount, setSubscriptions } from '../catchupStore'
import { getMyChannel, listSubscriptions } from '../catchupApi'
import { GoogleAuthError, requestYoutubeReadToken } from '../googleYoutubeAuth'
import { getYoutubeImportSnapshot, importYoutubeSubscriptions, subscribeYoutubeImport } from '../youtubeImport'

vi.mock('../catchupApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../catchupApi')>()
  return { ...actual, listSubscriptions: vi.fn(), getMyChannel: vi.fn() }
})
vi.mock('../googleYoutubeAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../googleYoutubeAuth')>()
  return { ...actual, requestYoutubeReadToken: vi.fn() }
})

const LIST = [{ id: 'UCnew', title: 'New' }]

beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('importYoutubeSubscriptions', () => {
  it('stores the list and the account, returns done, and bumps the revision once', async () => {
    vi.mocked(requestYoutubeReadToken).mockResolvedValue('tok')
    vi.mocked(listSubscriptions).mockResolvedValue(LIST)
    vi.mocked(getMyChannel).mockResolvedValue({ title: 'NooRotic', thumbnailUrl: 'https://img/d.jpg' })
    const before = getYoutubeImportSnapshot().revision

    const result = await importYoutubeSubscriptions()

    expect(result).toEqual({ status: 'done' })
    expect(getSubscriptions()).toEqual(LIST)
    expect(getAccount()).toEqual({ title: 'NooRotic', thumbnailUrl: 'https://img/d.jpg', importedAt: expect.any(Number) })
    expect(vi.mocked(getMyChannel)).toHaveBeenCalledWith('tok')
    expect(getYoutubeImportSnapshot().revision).toBe(before + 1)
  })

  it('keeps the import when the channel lookup fails', async () => {
    vi.mocked(requestYoutubeReadToken).mockResolvedValue('tok')
    vi.mocked(listSubscriptions).mockResolvedValue(LIST)
    vi.mocked(getMyChannel).mockRejectedValue(new Error('boom'))

    const result = await importYoutubeSubscriptions()

    expect(result).toEqual({ status: 'done' })
    expect(getSubscriptions()).toEqual(LIST)
    expect(getAccount()?.title).toBe('')
    expect(getAccount()?.thumbnailUrl).toBe('')
  })

  it('answers busy at once while one runs, without asking Google again', async () => {
    let finish!: (t: string) => void
    vi.mocked(requestYoutubeReadToken).mockReturnValue(new Promise<string>((r) => (finish = r)))
    vi.mocked(listSubscriptions).mockResolvedValue([])

    const first = importYoutubeSubscriptions()
    const second = await importYoutubeSubscriptions()

    expect(second).toEqual({ status: 'busy' })
    expect(vi.mocked(requestYoutubeReadToken)).toHaveBeenCalledTimes(1)
    finish('tok')
    await expect(first).resolves.toEqual({ status: 'done' })
  })

  it('leaves stored data alone and explains a closed sign-in', async () => {
    setSubscriptions([{ id: 'UCold', title: 'Old' }])
    setAccount({ title: 'Old', thumbnailUrl: '', importedAt: 1 })
    vi.mocked(requestYoutubeReadToken).mockRejectedValue(new GoogleAuthError('closed', 'closed'))
    const before = getYoutubeImportSnapshot().revision

    const result = await importYoutubeSubscriptions()

    expect(result).toEqual({ status: 'failed', message: 'The Google sign-in window was closed, so nothing was imported.' })
    expect(getSubscriptions()).toEqual([{ id: 'UCold', title: 'Old' }])
    expect(getAccount()?.title).toBe('Old')
    expect(vi.mocked(listSubscriptions)).not.toHaveBeenCalled()
    expect(getYoutubeImportSnapshot().revision).toBe(before)
  })

  it('tells listeners when it starts and ends', async () => {
    let finish!: (t: string) => void
    vi.mocked(requestYoutubeReadToken).mockReturnValue(new Promise<string>((r) => (finish = r)))
    vi.mocked(listSubscriptions).mockResolvedValue([])
    const listener = vi.fn()
    const unsubscribe = subscribeYoutubeImport(listener)

    const run = importYoutubeSubscriptions()
    expect(getYoutubeImportSnapshot().importing).toBe(true)
    expect(listener).toHaveBeenCalled()
    finish('tok')
    await run

    expect(getYoutubeImportSnapshot().importing).toBe(false)
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(2)
    unsubscribe()
  })
})

describe('the failure reason', () => {
  it('is kept in the snapshot after a failed import, and cleared when the next one starts and when it succeeds', async () => {
    vi.mocked(requestYoutubeReadToken).mockRejectedValueOnce(new GoogleAuthError('closed', 'closed'))
    await importYoutubeSubscriptions()
    expect(getYoutubeImportSnapshot().failure).toBe('The Google sign-in window was closed, so nothing was imported.')

    let finish!: (t: string) => void
    vi.mocked(requestYoutubeReadToken).mockReturnValueOnce(new Promise<string>((r) => (finish = r)))
    vi.mocked(listSubscriptions).mockResolvedValue(LIST)
    vi.mocked(getMyChannel).mockResolvedValue(null)
    const second = importYoutubeSubscriptions()
    expect(getYoutubeImportSnapshot().failure).toBeNull()
    finish('tok')
    await second
    expect(getYoutubeImportSnapshot().failure).toBeNull()
  })
})

describe('an import in another tab', () => {
  it('counts once, however many of its keys change', () => {
    vi.useFakeTimers()
    const unsubscribe = subscribeYoutubeImport(() => {})
    const before = getYoutubeImportSnapshot().revision

    window.dispatchEvent(new StorageEvent('storage', { key: 'prism_catchup_subscriptions' }))
    vi.advanceTimersByTime(30)
    window.dispatchEvent(new StorageEvent('storage', { key: 'prism_catchup_account' }))
    vi.advanceTimersByTime(150)

    expect(getYoutubeImportSnapshot().revision).toBe(before + 1)
    unsubscribe()
  })

  it('ignores other keys', () => {
    vi.useFakeTimers()
    const unsubscribe = subscribeYoutubeImport(() => {})
    const before = getYoutubeImportSnapshot().revision

    window.dispatchEvent(new StorageEvent('storage', { key: 'prism_catchup_watch_later' }))
    vi.advanceTimersByTime(150)

    expect(getYoutubeImportSnapshot().revision).toBe(before)
    unsubscribe()
  })
})
