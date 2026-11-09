import { useEffect } from 'react'
import { act, render } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { detectURLType } from '../../../lib/urlDetection'
import { STORAGE_KEYS } from '../../../config/storageKeys'
import { isFloatingSupported, loadFloatSize } from '../../../lib/floatingVideo'
import { openFloatingWindow } from '../../../lib/floatingWindow'
import type { FloatingSession, OpenFloatingOptions } from '../../../lib/floatingWindow'
import type { Mock } from 'vitest'
import FloatingVideoProvider from '../FloatingVideoProvider'
import { useFloatingVideo } from '../floatingVideoContext'
import type { FloatingVideoControls } from '../floatingVideoContext'

// The browser's window is the one thing replaced: opening it is what only Chrome can do.
vi.mock('../../../lib/floatingWindow', () => ({ openFloatingWindow: vi.fn() }))
vi.mock('../../../lib/floatingVideo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/floatingVideo')>()),
  isFloatingSupported: vi.fn(() => true),
}))

const LIVE_URL = 'https://twitch.tv/streamer'
const CLIP_URL = 'https://clips.twitch.tv/AbcDef'

interface FakeSession extends FloatingSession {
  setChannel: Mock<(channel: string) => void>
  close: Mock<() => void>
}

interface Opening {
  options: OpenFloatingOptions
  session: FakeSession
  resolve: () => Promise<void>
  reject: (error: Error) => Promise<void>
}

let opening: Opening | null = null

function lastOpening(): Opening {
  if (!opening) throw new Error('openFloatingWindow was not called')
  return opening
}

/** Makes the next openFloatingWindow calls wait until the test resolves or rejects them. */
function armOpener({ sessionClosed = false }: { sessionClosed?: boolean } = {}) {
  vi.mocked(openFloatingWindow).mockImplementation((options) => {
    let resolvePromise: (session: FloatingSession) => void = () => {}
    let rejectPromise: (error: Error) => void = () => {}
    const promise = new Promise<FloatingSession>((resolve, reject) => {
      resolvePromise = resolve
      rejectPromise = reject
    })
    const session: FakeSession = {
      setChannel: vi.fn(),
      // Closing a real session reports back through onClosed.
      close: vi.fn(() => options.onClosed()),
      closed: sessionClosed,
    }
    opening = {
      options,
      session,
      resolve: async () => {
        await act(async () => resolvePromise(session))
      },
      reject: async (error) => {
        await act(async () => rejectPromise(error))
      },
    }
    return promise
  })
}

interface ProbeState {
  controls: FloatingVideoControls
  dispatch: ReturnType<typeof useApp>['dispatch']
  navigate: ReturnType<typeof useNavigate>
}

let probe: ProbeState

function Probe() {
  const controls = useFloatingVideo()
  const { dispatch } = useApp()
  const navigate = useNavigate()
  useEffect(() => {
    probe = { controls, dispatch, navigate }
  })
  return null
}

function renderProvider(initialPath = '/twitch/streamer') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppProvider>
        <FloatingVideoProvider>
          <Probe />
        </FloatingVideoProvider>
      </AppProvider>
    </MemoryRouter>,
  )
}

function play(url: string) {
  act(() => probe.dispatch({ type: 'PLAY_URL', url, detection: detectURLType(url) }))
}

/** Renders on a live channel page and floats the video, leaving the opening session ready. */
async function float() {
  armOpener()
  const view = renderProvider()
  play(LIVE_URL)
  act(() => probe.controls.open())
  await lastOpening().resolve()
  return view
}

beforeEach(() => {
  vi.mocked(openFloatingWindow).mockReset()
  vi.mocked(isFloatingSupported).mockReturnValue(true)
  opening = null
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('FloatingVideoProvider: when the control is offered', () => {
  it('offers nothing in a browser that cannot do it, and open() does nothing', () => {
    vi.mocked(isFloatingSupported).mockReturnValue(false)
    renderProvider()
    play(LIVE_URL)

    expect(probe.controls.supported).toBe(false)
    expect(probe.controls.canOpen).toBe(false)
    act(() => probe.controls.open())
    expect(openFloatingWindow).not.toHaveBeenCalled()
  })

  it('offers it on a live Twitch channel page', () => {
    renderProvider('/twitch/streamer')
    play(LIVE_URL)
    expect(probe.controls.canOpen).toBe(true)
  })

  it('does not offer it on the hub', () => {
    renderProvider('/')
    play(LIVE_URL)
    expect(probe.controls.canOpen).toBe(false)
  })

  it('does not offer it while the page plays a clip', () => {
    renderProvider('/twitch/streamer')
    play(CLIP_URL)
    expect(probe.controls.canOpen).toBe(false)
  })
})

describe('FloatingVideoProvider: opening', () => {
  it('asks synchronously, and only floats once the window has been given', async () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_VIDEO_POPOUT_SIZE, '{"width":900,"height":500}')
    armOpener()
    renderProvider()
    play(LIVE_URL)

    act(() => probe.controls.open())

    expect(openFloatingWindow).toHaveBeenCalledTimes(1)
    expect(lastOpening().options).toMatchObject({
      channel: 'streamer',
      parent: 'localhost',
      size: { width: 900, height: 500 },
    })
    expect(probe.controls.isFloating).toBe(false)

    await lastOpening().resolve()
    expect(probe.controls.isFloating).toBe(true)
  })

  it('stays put and shows a notice when the browser refuses, which clears itself', async () => {
    vi.useFakeTimers()
    armOpener()
    renderProvider()
    play(LIVE_URL)
    act(() => probe.controls.open())

    await lastOpening().reject(new Error('no activation'))

    expect(probe.controls.isFloating).toBe(false)
    expect(probe.controls.blocked).toBe(true)
    act(() => {
      vi.advanceTimersByTime(5999)
    })
    expect(probe.controls.blocked).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(probe.controls.blocked).toBe(false)
  })

  it('restarts the notice when the browser refuses again while it is still showing', async () => {
    vi.useFakeTimers()
    armOpener()
    renderProvider()
    play(LIVE_URL)
    act(() => probe.controls.open())
    await lastOpening().reject(new Error('no activation'))
    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(probe.controls.blocked).toBe(true)

    act(() => probe.controls.open())
    await lastOpening().reject(new Error('no activation'))

    // Six seconds from the second refusal, not from the first.
    act(() => {
      vi.advanceTimersByTime(5999)
    })
    expect(probe.controls.blocked).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(probe.controls.blocked).toBe(false)
  })

  it('does not float if the window was already closed before the request resolved', async () => {
    armOpener({ sessionClosed: true })
    renderProvider()
    play(LIVE_URL)
    act(() => probe.controls.open())

    await lastOpening().resolve()

    expect(probe.controls.isFloating).toBe(false)
  })

  it('closes a window that is handed over after the app has unmounted', async () => {
    armOpener()
    const { unmount } = renderProvider()
    play(LIVE_URL)
    act(() => probe.controls.open())

    unmount()
    await lastOpening().resolve()

    expect(lastOpening().session.close).toHaveBeenCalled()
  })

  it('ignores a second open() while opening or floating', async () => {
    armOpener()
    renderProvider()
    play(LIVE_URL)

    act(() => probe.controls.open())
    act(() => probe.controls.open())
    expect(openFloatingWindow).toHaveBeenCalledTimes(1)

    await lastOpening().resolve()
    act(() => probe.controls.open())
    expect(openFloatingWindow).toHaveBeenCalledTimes(1)
  })
})

describe('FloatingVideoProvider: while floating', () => {
  it('follows the channel opened in the page, and leaves it alone off channel pages', async () => {
    await float()
    const { session } = lastOpening()

    act(() => probe.navigate('/twitch/other'))
    expect(session.setChannel).toHaveBeenCalledTimes(1)
    expect(session.setChannel).toHaveBeenCalledWith('other')

    act(() => probe.navigate('/'))
    expect(session.setChannel).toHaveBeenCalledTimes(1)
  })

  it('ends when the page goes to a YouTube page, which plays its own video', async () => {
    await float()

    act(() => probe.navigate('/youtube/abc'))

    expect(lastOpening().session.close).toHaveBeenCalled()
    expect(probe.controls.isFloating).toBe(false)
  })

  it('ends when a clip is started from the channel page', async () => {
    await float()

    play(CLIP_URL)

    expect(lastOpening().session.close).toHaveBeenCalled()
    expect(probe.controls.isFloating).toBe(false)
  })

  it('stays open when a channel is opened while an old clip is still the last thing played', async () => {
    await float()
    const { session } = lastOpening()

    // A clip pasted on the hub: not a channel page, so nothing ends.
    act(() => probe.navigate('/'))
    play(CLIP_URL)
    expect(session.close).not.toHaveBeenCalled()

    // The channel page has not yet replaced that clip with its own stream.
    act(() => probe.navigate('/twitch/other'))

    expect(session.close).not.toHaveBeenCalled()
    expect(probe.controls.isFloating).toBe(true)
    expect(session.setChannel).toHaveBeenCalledWith('other')
  })

  it('closes the window when the player inside it fails', async () => {
    await float()

    act(() => lastOpening().options.onFailed())

    expect(lastOpening().session.close).toHaveBeenCalled()
    expect(probe.controls.isFloating).toBe(false)
  })

  it('says so when the player inside the window fails, and the notice clears itself', async () => {
    vi.useFakeTimers()
    await float()

    act(() => lastOpening().options.onFailed())

    expect(probe.controls.failed).toBe(true)
    act(() => {
      vi.advanceTimersByTime(5999)
    })
    expect(probe.controls.failed).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(probe.controls.failed).toBe(false)
  })

  it('drops the failure notice when a window opens again', async () => {
    await float()
    act(() => lastOpening().options.onFailed())
    expect(probe.controls.failed).toBe(true)

    act(() => probe.controls.open())
    await lastOpening().resolve()

    expect(probe.controls.failed).toBe(false)
    expect(probe.controls.isFloating).toBe(true)
  })

  it('stops floating, and offers the control again, when the window goes away', async () => {
    await float()

    act(() => lastOpening().options.onClosed())

    expect(probe.controls.isFloating).toBe(false)
    expect(probe.controls.canOpen).toBe(true)
  })

  it('closes the window from the close control', async () => {
    await float()

    act(() => probe.controls.close())

    expect(lastOpening().session.close).toHaveBeenCalledTimes(1)
  })

  it('closes the window when the app unmounts', async () => {
    const { unmount } = await float()
    const { session } = lastOpening()

    unmount()

    expect(session.close).toHaveBeenCalled()
  })

  it('remembers the size the viewer left the window at', async () => {
    await float()

    act(() => lastOpening().options.onResize?.({ width: 700, height: 400 }))

    expect(loadFloatSize()).toEqual({ width: 700, height: 400 })
  })
})

describe('useFloatingVideo outside a provider', () => {
  it('is inert: nothing is offered and the controls do nothing', () => {
    let controls: FloatingVideoControls | undefined
    function Reader() {
      const value = useFloatingVideo()
      useEffect(() => {
        controls = value
      })
      return null
    }
    render(<Reader />)

    expect(controls).toMatchObject({
      supported: false,
      canOpen: false,
      isFloating: false,
      blocked: false,
      failed: false,
    })
    expect(() => {
      controls?.open()
      controls?.close()
    }).not.toThrow()
  })
})
