import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useChatPopout } from '../useChatPopout'
import { POPOUT_WINDOW_NAME, getTabId, saveBounds } from '../../../lib/chatPopout'
import { createFakePopoutBus } from '../../../test/fakePopoutBus'

function fakePopup() {
  return { closed: false, close: vi.fn() }
}

describe('useChatPopout', () => {
  let popup: ReturnType<typeof fakePopup>
  let openSpy: ReturnType<typeof vi.spyOn>
  let tabId: string

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    tabId = getTabId()
    vi.useFakeTimers()
    popup = fakePopup()
    openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // `setup(undefined)` must mean "no channel", so a default parameter will not do.
  const setup = (...args: [channel?: string | undefined]) => {
    const channel = args.length > 0 ? args[0] : 'streamer'
    const fake = createFakePopoutBus()
    const hook = renderHook(({ ch }) => useChatPopout(ch, fake.bus), { initialProps: { ch: channel } })
    return { ...fake, ...hook }
  }

  it('open() calls window.open with the pop-out URL naming this tab, the shared name and the saved bounds', () => {
    saveBounds({ width: 500, height: 800, left: 10, top: 20 })
    const { result } = setup()

    act(() => result.current.open())

    expect(openSpy).toHaveBeenCalledExactlyOnceWith(
      `/chat/streamer?owner=${encodeURIComponent(tabId)}`,
      POPOUT_WINDOW_NAME,
      'popup=yes,width=500,height=800,left=10,top=20',
    )
  })

  it('open() with nothing saved asks for the default window size', () => {
    const { result } = setup()
    act(() => result.current.open())
    expect(openSpy.mock.calls[0][2]).toBe('popup=yes,width=420,height=720')
  })

  it('open() does nothing without a channel', () => {
    const { result } = setup(undefined)
    act(() => result.current.open())
    expect(openSpy).not.toHaveBeenCalled()
    expect(result.current.isOpen).toBe(false)
  })

  it('a successful open marks it open at once, hello keeps it open, and closed clears it', () => {
    const { result, deliver } = setup()
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)
    expect(result.current.blocked).toBe(false)

    deliver({ type: 'hello', owner: tabId, channel: 'streamer' })
    expect(result.current.isOpen).toBe(true)

    deliver({ type: 'closed', owner: tabId })
    expect(result.current.isOpen).toBe(false)
  })

  it('a null window.open result sets blocked and keeps isOpen false', () => {
    openSpy.mockReturnValue(null)
    const { result } = setup()

    act(() => result.current.open())

    expect(result.current.blocked).toBe(true)
    expect(result.current.isOpen).toBe(false)
  })

  it('the blocked notice clears itself after a few seconds', () => {
    openSpy.mockReturnValue(null)
    const { result } = setup()
    act(() => result.current.open())
    expect(result.current.blocked).toBe(true)

    act(() => {
      vi.advanceTimersByTime(6000)
    })

    expect(result.current.blocked).toBe(false)
  })

  it('polling notices popup.closed becoming true without a closed message', () => {
    const { result } = setup()
    act(() => result.current.open())
    expect(result.current.isOpen).toBe(true)

    popup.closed = true
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(result.current.isOpen).toBe(false)
  })

  it('posts a ping naming this tab on mount; a hello reply marks it open with no window reference, and close() then posts close', () => {
    const { result, posted, deliver } = setup()
    expect(posted).toContainEqual({ type: 'ping', owner: tabId })
    expect(result.current.isOpen).toBe(false)

    deliver({ type: 'hello', owner: tabId, channel: 'streamer' })
    expect(result.current.isOpen).toBe(true)

    posted.length = 0
    act(() => result.current.close())

    expect(posted).toContainEqual({ type: 'close', owner: tabId })
    expect(result.current.isOpen).toBe(false)
  })

  it('a second mount re-attaches through ping and hello', () => {
    const fake = createFakePopoutBus()
    const first = renderHook(() => useChatPopout('streamer', fake.bus))
    first.unmount()
    fake.posted.length = 0

    const second = renderHook(() => useChatPopout('streamer', fake.bus))
    expect(fake.posted).toContainEqual({ type: 'ping', owner: tabId })
    expect(second.result.current.isOpen).toBe(false)

    fake.deliver({ type: 'hello', owner: tabId, channel: 'streamer' })

    expect(second.result.current.isOpen).toBe(true)
  })

  it('close() closes the window it opened and posts close', () => {
    const { result, posted } = setup()
    act(() => result.current.open())
    posted.length = 0

    act(() => result.current.close())

    expect(popup.close).toHaveBeenCalledOnce()
    expect(posted).toContainEqual({ type: 'close', owner: tabId })
    expect(result.current.isOpen).toBe(false)
  })

  it('posts set-channel when the channel changes while open, and not twice for the same channel', () => {
    const { result, posted, rerender } = setup()
    act(() => result.current.open())
    posted.length = 0

    rerender({ ch: 'someone-else' })
    expect(posted).toEqual([{ type: 'set-channel', owner: tabId, channel: 'someone-else' }])

    rerender({ ch: 'someone-else' })
    expect(posted).toHaveLength(1)
  })

  it('does not post set-channel for a channel change while closed', () => {
    const { posted, rerender } = setup()
    posted.length = 0

    rerender({ ch: 'someone-else' })

    expect(posted).toEqual([])
  })

  it('makes a recovered pop-out follow when it shows a different channel than this page', () => {
    const { posted, deliver } = setup('streamer')
    posted.length = 0

    deliver({ type: 'hello', owner: tabId, channel: 'an-old-channel' })

    expect(posted).toContainEqual({ type: 'set-channel', owner: tabId, channel: 'streamer' })
  })

  it('unmount stops listening and polling but leaves the window open', () => {
    const { result, unmount, subscriberCount } = setup()
    act(() => result.current.open())
    expect(subscriberCount()).toBe(1)

    unmount()
    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(subscriberCount()).toBe(0)
    expect(popup.close).not.toHaveBeenCalled()
  })

  describe('with other PRISM tabs open', () => {
    it('ignores a hello from a pop-out that belongs to another tab', () => {
      const { result, deliver } = setup()

      deliver({ type: 'hello', owner: 'another-tab', channel: 'someone-else' })

      expect(result.current.isOpen).toBe(false)
    })

    it('does not post set-channel for a pop-out that belongs to another tab', () => {
      const { posted, deliver } = setup('streamer')
      posted.length = 0

      deliver({ type: 'hello', owner: 'another-tab', channel: 'someone-else' })

      expect(posted).toEqual([])
    })

    it("ignores another tab's closed message, so its own pop-out stays open", () => {
      const { result, deliver } = setup()
      act(() => result.current.open())

      deliver({ type: 'closed', owner: 'another-tab' })

      expect(result.current.isOpen).toBe(true)
    })
  })
})
