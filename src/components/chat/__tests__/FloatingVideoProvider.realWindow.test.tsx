import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { detectURLType } from '../../../lib/urlDetection'
import { READY_TIMEOUT_MS } from '../../../lib/floatingWindow'
import { createFakeFloatingWindow } from '../../../test/fakeFloatingWindow'
import type { FakeFloatingWindow } from '../../../test/fakeFloatingWindow'
import FloatingVideoProvider from '../FloatingVideoProvider'
import { useFloatingVideo } from '../floatingVideoContext'
import type { FloatingVideoControls } from '../floatingVideoContext'

// FloatingVideoProvider.test.tsx replaces openFloatingWindow, and floatingWindow.test.ts never
// mounts the provider. Here the two run together: only the browser's own picture-in-picture API
// is faked, so a mismatch between what the provider asks for and what the window does shows up.

const LIVE_URL = 'https://twitch.tv/streamer'

let controls: FloatingVideoControls
let dispatch: ReturnType<typeof useApp>['dispatch']

function Probe() {
  const value = useFloatingVideo()
  const app = useApp()
  useEffect(() => {
    controls = value
    dispatch = app.dispatch
  })
  return null
}

/** What Chrome has and jsdom does not: a secure page with `documentPictureInPicture`. */
function installBrowser(requestWindow: () => Promise<Window>) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(window, 'documentPictureInPicture', {
    value: { requestWindow: vi.fn(requestWindow) },
    configurable: true,
  })
}

/** Renders on a live channel page, ready to open. */
function renderOnLiveChannel() {
  render(
    <MemoryRouter initialEntries={['/twitch/streamer']}>
      <AppProvider>
        <FloatingVideoProvider>
          <Probe />
        </FloatingVideoProvider>
      </AppProvider>
    </MemoryRouter>,
  )
  act(() =>
    dispatch({ type: 'PLAY_URL', url: LIVE_URL, detection: detectURLType(LIVE_URL) }),
  )
}

async function openWindow() {
  // open() asks the browser synchronously; the act lets the window's setup settle after it.
  await act(async () => {
    controls.open()
  })
}

describe('FloatingVideoProvider with the real window code', () => {
  let fake: FakeFloatingWindow

  beforeEach(() => {
    localStorage.clear()
    fake = createFakeFloatingWindow()
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(window, 'documentPictureInPicture')
    Reflect.deleteProperty(window, 'isSecureContext')
  })

  it('floats once the window is handed over, and stops when the window closes itself', async () => {
    installBrowser(() => Promise.resolve(fake.win))
    renderOnLiveChannel()
    expect(controls.canOpen).toBe(true)

    await openWindow()
    expect(controls.isFloating).toBe(true)

    act(() => fake.emit('pagehide'))
    expect(controls.isFloating).toBe(false)
    expect(controls.canOpen).toBe(true)
  })

  it('closes the window and says so when the player in it never starts', async () => {
    vi.useFakeTimers()
    installBrowser(() => Promise.resolve(fake.win))
    renderOnLiveChannel()
    await openWindow()

    // The viewer clicks the start screen. The Twitch script never loads here, so no sign of
    // life reaches the window and its ready timer runs out.
    act(() => {
      fake.win.document.querySelector('button')?.click()
    })
    act(() => {
      vi.advanceTimersByTime(READY_TIMEOUT_MS)
    })

    expect(controls.failed).toBe(true)
    expect(controls.isFloating).toBe(false)
    expect(fake.win.close).toHaveBeenCalled()
  })

  it('never floats a window that was already closed when the browser handed it over', async () => {
    fake.setClosed()
    installBrowser(() => Promise.resolve(fake.win))
    renderOnLiveChannel()

    await openWindow()

    expect(controls.isFloating).toBe(false)
    expect(controls.canOpen).toBe(true)
  })

  it('shows the refusal notice when the browser will not open a window', async () => {
    installBrowser(() => Promise.reject(new Error('no activation')))
    renderOnLiveChannel()

    await openWindow()

    expect(controls.isFloating).toBe(false)
    expect(controls.blocked).toBe(true)
  })
})
