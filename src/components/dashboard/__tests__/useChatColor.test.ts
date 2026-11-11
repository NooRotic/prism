import { renderHook, waitFor } from '@testing-library/react'
import { useChatColor } from '../useChatColor'
import { getChatColor, SessionExpiredError } from '../../../lib/twitchApi'

vi.mock('../../../lib/twitchApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/twitchApi')>()
  return { ...actual, getChatColor: vi.fn() }
})

const mockGetChatColor = vi.mocked(getChatColor)

describe('useChatColor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null first, then the colour Twitch reports', async () => {
    mockGetChatColor.mockResolvedValue('#9146FF')
    const { result } = renderHook(() => useChatColor('42', vi.fn()))

    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe('#9146FF'))
    expect(mockGetChatColor).toHaveBeenCalledWith('42')
  })

  it('makes no request without a user id', () => {
    const { result } = renderHook(() => useChatColor(null, vi.fn()))

    expect(result.current).toBeNull()
    expect(mockGetChatColor).not.toHaveBeenCalled()
  })

  it('asks once per user id, and again when the id changes', async () => {
    mockGetChatColor.mockResolvedValue('#FF7F50')
    const { result, rerender } = renderHook(({ id }) => useChatColor(id, vi.fn()), {
      initialProps: { id: '1' },
    })
    await waitFor(() => expect(result.current).toBe('#FF7F50'))

    rerender({ id: '1' })
    expect(mockGetChatColor).toHaveBeenCalledTimes(1)

    mockGetChatColor.mockResolvedValue('#00FF7F')
    rerender({ id: '2' })
    await waitFor(() => expect(result.current).toBe('#00FF7F'))
    expect(mockGetChatColor).toHaveBeenCalledTimes(2)
  })

  it('reports an expired session once and returns null', async () => {
    mockGetChatColor.mockRejectedValue(new SessionExpiredError())
    const onSessionExpired = vi.fn()
    renderHook(() => useChatColor('42', onSessionExpired))

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1))
  })

  it('swallows any other error and returns null', async () => {
    mockGetChatColor.mockRejectedValue(new Error('boom'))
    const onSessionExpired = vi.fn()
    const { result } = renderHook(() => useChatColor('42', onSessionExpired))

    await waitFor(() => expect(mockGetChatColor).toHaveBeenCalled())
    expect(result.current).toBeNull()
    expect(onSessionExpired).not.toHaveBeenCalled()
  })
})
