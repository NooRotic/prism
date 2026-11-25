import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLinkSuggestion } from '../useLinkSuggestion'
import { trackEvent } from '../../lib/analytics'
import { fetchYoutubeChannel } from '../../lib/youtubeChannelApi'
import { dismissSuggestion, findByTwitch, isDismissed, saveLink } from '../../lib/linkedAccounts'

vi.mock('../../lib/youtubeChannelApi', () => ({ fetchYoutubeChannel: vi.fn() }))
vi.mock('../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../lib/analytics')>()), trackEvent: vi.fn() }))
vi.mock('../../lib/youtubeApi', () => ({ isYouTubeApiAvailable: () => true }))

const channel = { channelId: 'UCX6OQ3DkcsbYNE6H8uQQuVA', title: 'Justin Wong', handle: '@jwonggg', description: 'I love fighting games!', thumbnail: '' }

beforeEach(() => {
  localStorage.clear()
  vi.mocked(fetchYoutubeChannel).mockReset()
  vi.mocked(trackEvent).mockClear()
})

describe('dismissed suggestions', () => {
  it('remembers a "not them" per channel, in any case', () => {
    expect(isDismissed('jwonggg')).toBe(false)
    dismissSuggestion('JWonggg')
    expect(isDismissed('jwonggg')).toBe(true)
    expect(isDismissed('someoneelse')).toBe(false)
  })
})

describe('useLinkSuggestion', () => {
  it('looks for a YouTube channel with the same handle and offers it when the bios do not settle it', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel })
    const { result } = renderHook(() => useLinkSuggestion('jwonggg', 'fighting game player'))
    await waitFor(() => expect(result.current.status).toBe('suggest'))
    expect(fetchYoutubeChannel).toHaveBeenCalledWith({ handle: 'jwonggg' })
    expect(result.current.channel?.title).toBe('Justin Wong')
    expect(findByTwitch('jwonggg')).toBeNull()
  })

  it('links it without asking, as confirmed, when both bios name each other', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel: { ...channel, description: 'streams at twitch.tv/jwonggg' } })
    renderHook(() => useLinkSuggestion('jwonggg', 'videos: youtube.com/@jwonggg'))
    await waitFor(() => expect(findByTwitch('jwonggg')?.confirmed).toBe(true))
    expect(findByTwitch('jwonggg')?.youtube?.channelId).toBe(channel.channelId)
  })

  it('accepting saves it as the viewer\'s own link; dismissing remembers "not them"', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel })
    const { result } = renderHook(() => useLinkSuggestion('jwonggg', ''))
    await waitFor(() => expect(result.current.status).toBe('suggest'))
    act(() => result.current.accept())
    expect(findByTwitch('jwonggg')).toMatchObject({ confirmed: false, youtube: { channelId: channel.channelId, title: 'Justin Wong', handle: '@jwonggg' } })

    localStorage.clear()
    const second = renderHook(() => useLinkSuggestion('jwonggg', ''))
    await waitFor(() => expect(second.result.current.status).toBe('suggest'))
    act(() => second.result.current.dismiss())
    expect(isDismissed('jwonggg')).toBe(true)
    expect(second.result.current.status).toBe('none')
  })

  it.each([[{ status: 'notfound' as const }], [{ status: 'error' as const }]])('offers nothing when YouTube answers %j', async (answer) => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue(answer)
    const { result } = renderHook(() => useLinkSuggestion('jwonggg', ''))
    await waitFor(() => expect(result.current.status).toBe('none'))
  })

  it('does not look at all when the channel is already linked, was dismissed, or has a name too short to be a handle', async () => {
    saveLink({ twitch: 'linked', youtube: { channelId: 'UCabc', title: 'T' }, confirmed: false, linkedAt: 1 })
    dismissSuggestion('dismissed')
    renderHook(() => useLinkSuggestion('linked', ''))
    renderHook(() => useLinkSuggestion('dismissed', ''))
    renderHook(() => useLinkSuggestion('ab', ''))
    await act(async () => {})
    expect(fetchYoutubeChannel).not.toHaveBeenCalled()
  })

  it('asks again for a different channel', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel })
    const { result, rerender } = renderHook(({ login }) => useLinkSuggestion(login, ''), { initialProps: { login: 'jwonggg' } })
    await waitFor(() => expect(result.current.status).toBe('suggest'))
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'notfound' })
    rerender({ login: 'another' })
    await waitFor(() => expect(result.current.status).toBe('none'))
    expect(fetchYoutubeChannel).toHaveBeenLastCalledWith({ handle: 'another' })
  })
})

describe('useLinkSuggestion: what is counted', () => {
  const PAIR = 'twitch/jwonggg <-> youtube/Justin Wong'

  it('a link it makes by itself is kept apart, and is not counted again on the next visit', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel: { ...channel, description: 'streams at twitch.tv/jwonggg' } })
    const first = renderHook(() => useLinkSuggestion('jwonggg', 'videos: youtube.com/@jwonggg'))
    await waitFor(() => expect(findByTwitch('jwonggg')?.confirmed).toBe(true))
    first.unmount()
    renderHook(() => useLinkSuggestion('jwonggg', 'videos: youtube.com/@jwonggg'))
    await act(async () => {})

    expect(vi.mocked(trackEvent).mock.calls).toEqual([['Linking', 'auto-linked', PAIR]])
  })

  it('offering a channel is not counted; accepting it is', async () => {
    vi.mocked(fetchYoutubeChannel).mockResolvedValue({ status: 'ok', channel })
    const { result } = renderHook(() => useLinkSuggestion('jwonggg', ''))
    await waitFor(() => expect(result.current.status).toBe('suggest'))
    expect(trackEvent).not.toHaveBeenCalled()

    act(() => result.current.accept())
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['Linking', 'linked', PAIR]])
  })
})
