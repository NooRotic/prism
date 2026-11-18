import { act, renderHook } from '@testing-library/react'
import { setSubscriptions } from '../../lib/catchupStore'
import { getMyChannel, listSubscriptions } from '../../lib/catchupApi'
import { isGoogleAuthConfigured, requestYoutubeReadToken } from '../../lib/googleYoutubeAuth'
import { importYoutubeSubscriptions } from '../../lib/youtubeImport'
import { useYoutubeAccount } from '../useYoutubeAccount'

vi.mock('../../lib/catchupApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/catchupApi')>()
  return { ...actual, listSubscriptions: vi.fn(), getMyChannel: vi.fn() }
})
vi.mock('../../lib/googleYoutubeAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/googleYoutubeAuth')>()
  return { ...actual, requestYoutubeReadToken: vi.fn(), isGoogleAuthConfigured: vi.fn(() => true) }
})

beforeEach(() => {
  localStorage.clear()
  vi.resetAllMocks()
  vi.mocked(isGoogleAuthConfigured).mockReturnValue(true)
})

describe('useYoutubeAccount', () => {
  it('counts a list without an account record as imported', () => {
    setSubscriptions([
      { id: 'UC1', title: 'One' },
      { id: 'UC2', title: 'Two' },
      { id: 'UC3', title: 'Three' },
    ])

    const { result } = renderHook(() => useYoutubeAccount())

    expect(result.current.imported).toBe(true)
    expect(result.current.account).toBeNull()
    expect(result.current.subscriptionCount).toBe(3)
  })

  it('says not imported when nothing is stored', () => {
    const { result } = renderHook(() => useYoutubeAccount())
    expect(result.current.imported).toBe(false)
    expect(result.current.subscriptionCount).toBe(0)
  })

  it('re-reads after an import', async () => {
    vi.mocked(requestYoutubeReadToken).mockResolvedValue('tok')
    vi.mocked(listSubscriptions).mockResolvedValue([{ id: 'UCnew', title: 'New' }])
    vi.mocked(getMyChannel).mockResolvedValue({ title: 'NooRotic', thumbnailUrl: 'https://img/d.jpg' })
    const { result } = renderHook(() => useYoutubeAccount())

    await act(async () => {
      await importYoutubeSubscriptions()
    })

    expect(result.current.account?.title).toBe('NooRotic')
    expect(result.current.subscriptionCount).toBe(1)
    expect(result.current.imported).toBe(true)
  })

  it('follows whether Google sign-in is set up in this build', () => {
    vi.mocked(isGoogleAuthConfigured).mockReturnValue(false)
    const { result } = renderHook(() => useYoutubeAccount())
    expect(result.current.configured).toBe(false)
  })
})
