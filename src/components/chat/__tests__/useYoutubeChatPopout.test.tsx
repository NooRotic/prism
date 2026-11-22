import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { useYoutubeChatPopout } from '../useYoutubeChatPopout'
import ChatHeader from '../ChatHeader'
import { removeLink, saveLink } from '../../../lib/linkedAccounts'
import { findYoutubeChatTarget } from '../../../lib/youtubeChatLookup'
import type { YoutubeChatTarget } from '../../../lib/youtubeChatTarget'

vi.mock('../../../lib/youtubeChatLookup', () => ({
  fastYoutubeChatTarget: vi.fn(() => null),
  findYoutubeChatTarget: vi.fn(),
}))

const posted: Array<{ type: string; channel?: string }> = []
vi.mock('../../../lib/chatPopout', async (orig) => {
  const real = await orig<typeof import('../../../lib/chatPopout')>()
  return {
    ...real,
    createPopoutBus: () => ({ post: (m: { type: string; channel?: string }) => posted.push(m), subscribe: () => () => {}, close: () => {} }),
  }
})

const link = (twitch: string, channelId: string, title: string) =>
  saveLink({ twitch, youtube: { channelId, title }, confirmed: false, linkedAt: 1 })

/** A lookup the test settles by hand. */
function deferred() {
  let resolve!: (t: YoutubeChatTarget) => void
  const promise = new Promise<YoutubeChatTarget>((r) => (resolve = r))
  return { promise, resolve }
}

let openSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  posted.length = 0
  vi.mocked(findYoutubeChatTarget).mockReset()
  openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: false, close: vi.fn() } as unknown as Window)
})
afterEach(() => vi.restoreAllMocks())

const setChannels = () => posted.filter((m) => m.type === 'set-channel').map((m) => m.channel)

describe('useYoutubeChatPopout', () => {
  it('is unavailable without a linked YouTube account', () => {
    const { result } = renderHook(() => useYoutubeChatPopout('streamer'))
    expect(result.current.available).toBe(false)
  })

  it('opens the window inside the click, before the lookup answers, then sends what it found', async () => {
    link('streamer', 'UC1', 'Streamer YT')
    const d = deferred()
    vi.mocked(findYoutubeChatTarget).mockReturnValue(d.promise)
    const { result } = renderHook(() => useYoutubeChatPopout('streamer'))
    expect(result.current.available).toBe(true)
    act(() => result.current.open())
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/chat-youtube/looking'), 'prism-chat-popout-youtube', expect.any(String))
    await act(async () => d.resolve({ kind: 'video', videoId: 'abcdefghijk' }))
    expect(setChannels()).toContain('v:abcdefghijk')
  })

  it('follows the Twitch page to another linked streamer while open, with one lookup', async () => {
    link('a', 'UCa', 'A on YT')
    link('b', 'UCb', 'B on YT')
    vi.mocked(findYoutubeChatTarget).mockResolvedValueOnce({ kind: 'video', videoId: 'aaaaaaaaaaa' })
    vi.mocked(findYoutubeChatTarget).mockResolvedValueOnce({ kind: 'video', videoId: 'bbbbbbbbbbb' })
    const { result, rerender } = renderHook(({ login }) => useYoutubeChatPopout(login), { initialProps: { login: 'a' } })
    await act(async () => result.current.open())
    rerender({ login: 'b' })
    await act(async () => {})
    expect(findYoutubeChatTarget).toHaveBeenCalledTimes(2)
    expect(vi.mocked(findYoutubeChatTarget).mock.calls[1][0]).toEqual({ channelId: 'UCb', title: 'B on YT' })
    expect(setChannels().at(-1)).toBe('v:bbbbbbbbbbb')
  })

  it('looks nothing up while closed', async () => {
    link('a', 'UCa', 'A on YT')
    link('b', 'UCb', 'B on YT')
    const { rerender } = renderHook(({ login }) => useYoutubeChatPopout(login), { initialProps: { login: 'a' } })
    rerender({ login: 'b' })
    await act(async () => {})
    expect(findYoutubeChatTarget).not.toHaveBeenCalled()
  })

  it('says the streamer is not on YouTube when the page moves to an unlinked channel or the link is removed', async () => {
    link('a', 'UCa', 'A on YT')
    vi.mocked(findYoutubeChatTarget).mockResolvedValue({ kind: 'video', videoId: 'aaaaaaaaaaa' })
    const { result, rerender } = renderHook(({ login }) => useYoutubeChatPopout(login), { initialProps: { login: 'a' } })
    await act(async () => result.current.open())
    rerender({ login: 'nolink' })
    await act(async () => {})
    expect(setChannels().at(-1)).toBe('none:nolink')
    rerender({ login: 'a' })
    await act(async () => {})
    act(() => removeLink('a'))
    await act(async () => {})
    expect(setChannels().at(-1)).toBe('none:a')
  })

  it('ignores a lookup that answers after the page moved on', async () => {
    link('a', 'UCa', 'A on YT')
    link('b', 'UCb', 'B on YT')
    const slow = deferred()
    vi.mocked(findYoutubeChatTarget).mockReturnValueOnce(slow.promise)
    vi.mocked(findYoutubeChatTarget).mockResolvedValueOnce({ kind: 'video', videoId: 'bbbbbbbbbbb' })
    const { result, rerender } = renderHook(({ login }) => useYoutubeChatPopout(login), { initialProps: { login: 'a' } })
    act(() => result.current.open())
    rerender({ login: 'b' })
    await act(async () => {})
    await act(async () => slow.resolve({ kind: 'video', videoId: 'aaaaaaaaaaa' }))
    expect(setChannels()).not.toContain('v:aaaaaaaaaaa')
    expect(setChannels().at(-1)).toBe('v:bbbbbbbbbbb')
  })
})

describe('ChatHeader YouTube chat button', () => {
  const base = {
    side: 'right' as const,
    onHide: vi.fn(),
    onSwapSide: vi.fn(),
    onPopOut: vi.fn(),
    fill: false,
    onToggleFill: vi.fn(),
    fullscreenSupported: true,
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
    textSize: { scale: 1, canSmaller: true, canLarger: true, onSmaller: vi.fn(), onLarger: vi.fn(), onReset: vi.fn() },
    dragHandleProps: {},
  }
  it('is absent without a linked account', () => {
    render(<ChatHeader {...base} />)
    expect(screen.queryByRole('button', { name: 'Pop out YouTube chat' })).not.toBeInTheDocument()
  })
  it('sits right after Pop out chat and calls its handler', () => {
    const onClick = vi.fn()
    render(<ChatHeader {...base} youtubeChat={{ onClick }} />)
    const buttons = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'))
    expect(buttons.indexOf('Pop out YouTube chat')).toBe(buttons.indexOf('Pop out chat') + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Pop out YouTube chat' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
