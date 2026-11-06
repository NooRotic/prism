import { useEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { detectURLType } from '../../../lib/urlDetection'
import { isFloatingSupported } from '../../../lib/floatingVideo'
import { openFloatingWindow } from '../../../lib/floatingWindow'
import type { FloatingSession, OpenFloatingOptions } from '../../../lib/floatingWindow'
import ChatDock from '../ChatDock'
import FloatingVideoProvider from '../FloatingVideoProvider'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'

// Real provider, real dock, real header, strip, bar and panel. Only the browser's window,
// and the dock's two unrelated hooks, are replaced.
vi.mock('../../../lib/floatingWindow', () => ({ openFloatingWindow: vi.fn() }))
vi.mock('../../../lib/floatingVideo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/floatingVideo')>()),
  isFloatingSupported: vi.fn(() => true),
}))
vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))

const LIVE_URL = 'https://twitch.tv/streamer'

let options: OpenFloatingOptions | null = null
const session = { setChannel: vi.fn(), close: vi.fn(), closed: false }

/** What the dock's page does on a live channel: points the player at the channel. */
function Page() {
  const { dispatch } = useApp()
  useEffect(() => {
    dispatch({ type: 'PLAY_URL', url: LIVE_URL, detection: detectURLType(LIVE_URL) })
  }, [dispatch])
  return <ChatDock channel="streamer" player={<div>the player</div>} />
}

const chatFrame = () => screen.queryByTitle('streamer Twitch chat')
const popOutButtons = () => screen.queryAllByRole('button', { name: 'Pop out video' })
const bringBackButtons = () => screen.queryAllByRole('button', { name: 'Bring video back' })

/** Clicks Pop out video and lets the (mocked) browser hand the window over. */
async function popOut() {
  fireEvent.click(popOutButtons()[0])
  await act(async () => {})
}

beforeEach(() => {
  options = null
  session.setChannel.mockReset()
  session.close.mockReset()
  session.close.mockImplementation(() => options?.onClosed())
  vi.mocked(isFloatingSupported).mockReturnValue(true)
  vi.mocked(openFloatingWindow).mockReset()
  vi.mocked(openFloatingWindow).mockImplementation((opened) => {
    options = opened
    return Promise.resolve(session as FloatingSession)
  })
  vi.mocked(useChatPopout).mockReset()
  vi.mocked(useChatPopout).mockReturnValue({
    isOpen: false,
    blocked: false,
    open: vi.fn(),
    close: vi.fn(),
  })
  vi.mocked(useFullscreen).mockReset()
  vi.mocked(useFullscreen).mockReturnValue({ supported: false, isFullscreen: false, toggle: vi.fn() })
  render(
    <MemoryRouter initialEntries={['/twitch/streamer']}>
      <AppProvider>
        <FloatingVideoProvider>
          <Page />
        </FloatingVideoProvider>
      </AppProvider>
    </MemoryRouter>,
  )
})

describe('popping the video out of a channel page', () => {
  it('offers the control on a live channel page, with the player in place', () => {
    expect(popOutButtons().length).toBeGreaterThan(0)
    expect(screen.getByText('the player')).toBeInTheDocument()
  })

  it('takes the player out of the page, leaves the chat, and offers to bring it back', async () => {
    const frame = chatFrame()
    await popOut()

    expect(openFloatingWindow).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('the player')).not.toBeInTheDocument()
    expect(chatFrame()).toBe(frame)
    expect(bringBackButtons().length).toBeGreaterThan(0)
    expect(popOutButtons()).toHaveLength(0)
  })

  it('puts the player back when the window goes away', async () => {
    await popOut()

    act(() => options?.onClosed())

    expect(screen.getByText('the player')).toBeInTheDocument()
    expect(popOutButtons().length).toBeGreaterThan(0)
    expect(bringBackButtons()).toHaveLength(0)
  })

  it('closes the window, and so brings the player back, from Bring video back', async () => {
    await popOut()

    fireEvent.click(bringBackButtons()[0])

    expect(session.close).toHaveBeenCalledTimes(1)
    expect(screen.getByText('the player')).toBeInTheDocument()
  })
})
