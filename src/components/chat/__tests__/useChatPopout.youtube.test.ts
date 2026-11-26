import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useChatPopout } from '../useChatPopout'
import { trackEvent } from '../../../lib/analytics'
import { getTabId } from '../../../lib/chatPopout'
import { createFakePopoutBus } from '../../../test/fakePopoutBus'

vi.mock('../../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../../lib/analytics')>()), trackEvent: vi.fn() }))

describe('useChatPopout for the YouTube chat', () => {
  let tabId: string
  let openSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    tabId = getTabId()
    openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: false, close: vi.fn() } as unknown as Window)
  })
  afterEach(() => vi.restoreAllMocks())

  const setup = (channel: string) => {
    const fake = createFakePopoutBus()
    const hook = renderHook(({ ch }) => useChatPopout(ch, fake.bus, 'youtube'), { initialProps: { ch: channel } })
    return { ...fake, ...hook }
  }

  it('opens its own window at the YouTube route, with the target given in the click', () => {
    const { result } = setup('looking')
    result.current.open('v:abcdefghijk')
    expect(openSpy).toHaveBeenCalledWith(
      `/chat-youtube/v%3Aabcdefghijk?owner=${encodeURIComponent(tabId)}`,
      'prism-chat-popout-youtube',
      expect.stringContaining('popup=yes'),
    )
  })

  it('counts the window apart from the Twitch one, without what it shows', () => {
    vi.mocked(trackEvent).mockClear()
    const { result } = setup('looking')
    act(() => void result.current.open('v:abcdefghijk'))
    expect(vi.mocked(trackEvent).mock.calls).toEqual([['Feature', 'YouTube chat pop-out']])
  })

  it('ignores a click event passed straight from onClick (only a string overrides the channel)', () => {
    const { result } = setup('v:abcdefghijk')
    ;(result.current.open as (x: unknown) => void)({ type: 'click', target: {} })
    expect(openSpy).toHaveBeenCalledWith(
      `/chat-youtube/v%3Aabcdefghijk?owner=${encodeURIComponent(tabId)}`,
      'prism-chat-popout-youtube',
      expect.any(String),
    )
  })

  it('re-sends the current target when the window says hello with an older one', () => {
    const { result, rerender, posted, deliver } = setup('looking')
    result.current.open()
    rerender({ ch: 'v:abcdefghijk' })
    expect(posted).toContainEqual({ type: 'set-channel', owner: tabId, channel: 'v:abcdefghijk' })
    const before = posted.length
    // The window was not listening yet; it only now says hello, still showing "looking".
    deliver({ type: 'hello', owner: tabId, channel: 'looking' })
    expect(posted.slice(before)).toContainEqual({ type: 'set-channel', owner: tabId, channel: 'v:abcdefghijk' })
  })

  it('a hello naming the current target needs no reply', () => {
    const { result, posted, deliver } = setup('v:abcdefghijk')
    result.current.open()
    const before = posted.length
    deliver({ type: 'hello', owner: tabId, channel: 'v:abcdefghijk' })
    expect(posted.slice(before).filter((m) => m.type === 'set-channel')).toEqual([])
  })

  it('the Twitch and YouTube pop-outs never talk on each other’s bus', () => {
    const tw = createFakePopoutBus()
    const yt = createFakePopoutBus()
    const twitch = renderHook(({ ch }) => useChatPopout(ch, tw.bus), { initialProps: { ch: 'streamer' } })
    const youtube = renderHook(({ ch }) => useChatPopout(ch, yt.bus, 'youtube'), { initialProps: { ch: 'looking' } })
    twitch.result.current.open()
    youtube.result.current.open()
    twitch.rerender({ ch: 'other' })
    expect(tw.posted).toContainEqual({ type: 'set-channel', owner: tabId, channel: 'other' })
    expect(yt.posted.some((m) => m.type === 'set-channel')).toBe(false)
  })
})
