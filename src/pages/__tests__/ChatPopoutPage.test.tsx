import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import App from '../../App'
import ChatPopoutPage from '../ChatPopoutPage'
import { loadBounds } from '../../lib/chatPopout'
import type { PopoutBus } from '../../lib/chatPopout'
import { createFakePopoutBus } from '../../test/fakePopoutBus'

const createFakeBus = createFakePopoutBus

function LocationProbe() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

const renderPage = (bus: PopoutBus, channel = 'streamer', search = '?owner=tab-1') =>
  render(
    <MemoryRouter initialEntries={[`/chat/${channel}${search}`]}>
      <Routes>
        <Route path="/chat/:channel" element={<ChatPopoutPage bus={bus} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

// `outer*` includes the window frame; `inner*` is the content area, which is what
// window.open's width/height features mean.
function setWindowGeometry(g: {
  outerWidth: number
  outerHeight: number
  innerWidth: number
  innerHeight: number
  screenX: number
  screenY: number
}) {
  for (const [key, value] of Object.entries(g)) {
    Object.defineProperty(window, key, { value, configurable: true })
  }
}

describe('ChatPopoutPage', () => {
  beforeEach(() => {
    localStorage.clear()
    setWindowGeometry({
      outerWidth: 480,
      outerHeight: 760,
      innerWidth: 464,
      innerHeight: 680,
      screenX: 30,
      screenY: 40,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('renders the channel chat and nothing else', () => {
    const { bus } = createFakeBus()
    renderPage(bus)
    expect(screen.getByTitle('streamer Twitch chat')).toBeInTheDocument()
  })

  it('posts hello with its owner and the channel on mount', () => {
    const { bus, posted } = createFakeBus()
    renderPage(bus)
    expect(posted).toContainEqual({ type: 'hello', owner: 'tab-1', channel: 'streamer' })
  })

  it('answers its owner’s ping with hello', () => {
    const { bus, posted, deliver } = createFakeBus()
    renderPage(bus)
    posted.length = 0

    deliver({ type: 'ping', owner: 'tab-1' })

    expect(posted).toEqual([{ type: 'hello', owner: 'tab-1', channel: 'streamer' }])
  })

  it('set-channel from its owner switches the chat to the new channel and keeps the owner in the URL', () => {
    const { bus, deliver } = createFakeBus()
    renderPage(bus)

    deliver({ type: 'set-channel', owner: 'tab-1', channel: 'someone-else' })

    expect(screen.getByTitle('someone-else Twitch chat')).toBeInTheDocument()
    expect(screen.queryByTitle('streamer Twitch chat')).not.toBeInTheDocument()
    // The owner must survive, or a reload of the pop-out would orphan it.
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/someone-else?owner=tab-1')
  })

  it('answers ping with the channel it was switched to', () => {
    const { bus, posted, deliver } = createFakeBus()
    renderPage(bus)
    deliver({ type: 'set-channel', owner: 'tab-1', channel: 'someone-else' })
    posted.length = 0

    deliver({ type: 'ping', owner: 'tab-1' })

    expect(posted).toEqual([{ type: 'hello', owner: 'tab-1', channel: 'someone-else' }])
  })

  it('close from its owner closes the window', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    const { bus, deliver } = createFakeBus()
    renderPage(bus)

    deliver({ type: 'close', owner: 'tab-1' })

    expect(close).toHaveBeenCalledOnce()
  })

  it('pagehide posts closed for its owner and saves the content size, not the outer size that includes the frame', () => {
    const { bus, posted } = createFakeBus()
    renderPage(bus)

    window.dispatchEvent(new Event('pagehide'))

    expect(posted).toContainEqual({ type: 'closed', owner: 'tab-1' })
    // window.open's width/height are the content area, so saving the outer size
    // would make the window grow by its frame every time it is reopened.
    expect(loadBounds()).toEqual({ width: 464, height: 680, left: 30, top: 40 })
  })

  it('resize saves the content size and position', () => {
    const { bus } = createFakeBus()
    renderPage(bus)
    setWindowGeometry({
      outerWidth: 600,
      outerHeight: 900,
      innerWidth: 584,
      innerHeight: 820,
      screenX: -1200,
      screenY: 10,
    })

    window.dispatchEvent(new Event('resize'))

    expect(loadBounds()).toEqual({ width: 584, height: 820, left: -1200, top: 10 })
  })

  it('does not replace good saved bounds while the window reports a minimized position', () => {
    const { bus } = createFakeBus()
    renderPage(bus)
    window.dispatchEvent(new Event('resize'))
    const good = loadBounds()
    expect(good).not.toBeNull()

    setWindowGeometry({
      outerWidth: 160,
      outerHeight: 28,
      innerWidth: 0,
      innerHeight: 0,
      screenX: -32000,
      screenY: -32000,
    })
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('pagehide'))

    expect(loadBounds()).toEqual(good)
  })

  it('samples the bounds every second, and writes only when they changed', () => {
    vi.useFakeTimers()
    const setItem = vi.spyOn(localStorage, 'setItem')
    const { bus } = createFakeBus()
    renderPage(bus)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(setItem).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(setItem).toHaveBeenCalledTimes(1)

    setWindowGeometry({
      outerWidth: 480,
      outerHeight: 760,
      innerWidth: 464,
      innerHeight: 680,
      screenX: 900,
      screenY: 40,
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(setItem).toHaveBeenCalledTimes(2)
    expect(loadBounds()?.left).toBe(900)
  })

  it('sets the document title from the channel', () => {
    const { bus } = createFakeBus()
    renderPage(bus)
    expect(document.title).toBe('streamer chat')
  })

  it('stops listening once it is unmounted', () => {
    const { bus, posted, deliver } = createFakeBus()
    const { unmount } = renderPage(bus)
    unmount()
    posted.length = 0

    deliver({ type: 'ping', owner: 'tab-1' })
    window.dispatchEvent(new Event('pagehide'))

    expect(posted).toEqual([])
  })

  describe('with other PRISM tabs open', () => {
    it('ignores ping, set-channel and close from a tab that is not its owner', () => {
      const close = vi.spyOn(window, 'close').mockImplementation(() => {})
      const { bus, posted, deliver } = createFakeBus()
      renderPage(bus)
      posted.length = 0

      deliver({ type: 'ping', owner: 'another-tab' })
      deliver({ type: 'set-channel', owner: 'another-tab', channel: 'someone-else' })
      deliver({ type: 'close', owner: 'another-tab' })

      expect(posted).toEqual([])
      expect(close).not.toHaveBeenCalled()
      expect(screen.getByTitle('streamer Twitch chat')).toBeInTheDocument()
      expect(screen.getByTestId('location')).toHaveTextContent('/chat/streamer?owner=tab-1')
    })

    it('a pop-out loaded directly, with no owner, answers nobody and obeys nobody', () => {
      const close = vi.spyOn(window, 'close').mockImplementation(() => {})
      const { bus, posted, deliver } = createFakeBus()
      renderPage(bus, 'streamer', '')
      expect(posted).toContainEqual({ type: 'hello', owner: '', channel: 'streamer' })
      posted.length = 0

      deliver({ type: 'ping', owner: 'tab-1' })
      deliver({ type: 'set-channel', owner: 'tab-1', channel: 'someone-else' })
      deliver({ type: 'close', owner: 'tab-1' })

      expect(posted).toEqual([])
      expect(close).not.toHaveBeenCalled()
      expect(screen.getByTitle('streamer Twitch chat')).toBeInTheDocument()
    })
  })
})

describe('the /chat/:channel route', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('serves only the chat, with none of the page chrome', () => {
    window.history.pushState({}, '', '/chat/somechannel')
    render(<App />)

    expect(screen.getByTitle('somechannel Twitch chat')).toBeInTheDocument()
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('channel-rail')).not.toBeInTheDocument()
  })
})
