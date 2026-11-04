import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import App from '../../App'
import ChatPopoutPage from '../ChatPopoutPage'
import { loadBounds } from '../../lib/chatPopout'
import type { PopoutBus, PopoutMessage } from '../../lib/chatPopout'

function createFakeBus() {
  const subscribers = new Set<(msg: PopoutMessage) => void>()
  const posted: PopoutMessage[] = []
  const bus: PopoutBus = {
    post: (msg) => {
      posted.push(msg)
    },
    subscribe: (cb) => {
      subscribers.add(cb)
      return () => {
        subscribers.delete(cb)
      }
    },
    close: vi.fn(),
  }
  const deliver = (msg: PopoutMessage) =>
    act(() => {
      subscribers.forEach((cb) => cb(msg))
    })
  return { bus, posted, deliver }
}

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>
}

const renderPage = (bus: PopoutBus, channel = 'streamer') =>
  render(
    <MemoryRouter initialEntries={[`/chat/${channel}`]}>
      <Routes>
        <Route path="/chat/:channel" element={<ChatPopoutPage bus={bus} />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  )

function setWindowGeometry(g: { outerWidth: number; outerHeight: number; screenX: number; screenY: number }) {
  for (const [key, value] of Object.entries(g)) {
    Object.defineProperty(window, key, { value, configurable: true })
  }
}

describe('ChatPopoutPage', () => {
  beforeEach(() => {
    localStorage.clear()
    setWindowGeometry({ outerWidth: 480, outerHeight: 760, screenX: 30, screenY: 40 })
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

  it('posts hello with the channel on mount', () => {
    const { bus, posted } = createFakeBus()
    renderPage(bus)
    expect(posted).toContainEqual({ type: 'hello', channel: 'streamer' })
  })

  it('answers ping with hello', () => {
    const { bus, posted, deliver } = createFakeBus()
    renderPage(bus)
    posted.length = 0

    deliver({ type: 'ping' })

    expect(posted).toEqual([{ type: 'hello', channel: 'streamer' }])
  })

  it('set-channel switches the chat to the new channel and the URL', () => {
    const { bus, deliver } = createFakeBus()
    renderPage(bus)

    deliver({ type: 'set-channel', channel: 'someone-else' })

    expect(screen.getByTitle('someone-else Twitch chat')).toBeInTheDocument()
    expect(screen.queryByTitle('streamer Twitch chat')).not.toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent('/chat/someone-else')
  })

  it('answers ping with the channel it was switched to', () => {
    const { bus, posted, deliver } = createFakeBus()
    renderPage(bus)
    deliver({ type: 'set-channel', channel: 'someone-else' })
    posted.length = 0

    deliver({ type: 'ping' })

    expect(posted).toEqual([{ type: 'hello', channel: 'someone-else' }])
  })

  it('close closes the window', () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {})
    const { bus, deliver } = createFakeBus()
    renderPage(bus)

    deliver({ type: 'close' })

    expect(close).toHaveBeenCalledOnce()
  })

  it('pagehide posts closed and saves the window bounds', () => {
    const { bus, posted } = createFakeBus()
    renderPage(bus)

    window.dispatchEvent(new Event('pagehide'))

    expect(posted).toContainEqual({ type: 'closed' })
    expect(loadBounds()).toEqual({ width: 480, height: 760, left: 30, top: 40 })
  })

  it('resize saves the window bounds', () => {
    const { bus } = createFakeBus()
    renderPage(bus)
    setWindowGeometry({ outerWidth: 600, outerHeight: 900, screenX: -1200, screenY: 10 })

    window.dispatchEvent(new Event('resize'))

    expect(loadBounds()).toEqual({ width: 600, height: 900, left: -1200, top: 10 })
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

    setWindowGeometry({ outerWidth: 480, outerHeight: 760, screenX: 900, screenY: 40 })
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

    deliver({ type: 'ping' })
    window.dispatchEvent(new Event('pagehide'))

    expect(posted).toEqual([])
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
