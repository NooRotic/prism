import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { detectURLType } from '../../lib/urlDetection'
import TwitchPlayerPage from '../TwitchPlayerPage'

// The clip and VOD grids, and the sidebar's "Back to live" button, sit below
// the player. Selecting from any of them must bring the player into view. The
// real AppProvider is used so PLAY_URL goes through the real reducer; the heavy
// children are stubs that only dispatch what the real ones do on click.
vi.mock('../../hooks/useChannelData', () => ({ useChannelData: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: () => ({ handleAuthError: vi.fn(), isAuthenticated: false }),
}))
vi.mock('../../components/chat/ChatDock', () => ({
  default: () => <div data-testid="chat-dock" />,
}))
vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/ProfileSidebar', () => ({
  default: () => <div />,
}))
vi.mock('../../components/channel/StatsRow', () => ({ default: () => <div /> }))
vi.mock('../../components/layout/DebugPanel', () => ({
  default: () => <div />,
}))
vi.mock('../../components/channel/ClipGrid', async () => {
  const { useApp } = await import('../../contexts/AppContext')
  const { detectURLType } = await import('../../lib/urlDetection')
  return {
    default: function ClipGridStub() {
      const { dispatch } = useApp()
      return (
        <button
          onClick={() => {
            const url = 'https://clips.twitch.tv/SomeClip'
            dispatch({ type: 'PLAY_URL', url, detection: detectURLType(url) })
          }}
        >
          play clip
        </button>
      )
    },
  }
})
vi.mock('../../components/channel/VODGrid', async () => {
  const { useApp } = await import('../../contexts/AppContext')
  const { detectURLType } = await import('../../lib/urlDetection')
  return {
    default: function VODGridStub() {
      const { dispatch } = useApp()
      return (
        <button
          onClick={() => {
            const url = 'https://www.twitch.tv/videos/123456789'
            dispatch({ type: 'PLAY_URL', url, detection: detectURLType(url) })
          }}
        >
          play vod
        </button>
      )
    },
  }
})

// Stands in for ProfileSidebar's "Back to live" button, and for any unrelated
// state change.
function Controls() {
  const { dispatch } = useApp()
  return (
    <>
      <button
        onClick={() => {
          const url = 'https://twitch.tv/streamer'
          dispatch({ type: 'PLAY_URL', url, detection: detectURLType(url) })
        }}
      >
        back to live
      </button>
      <button onClick={() => dispatch({ type: 'TOGGLE_DEBUG' })}>
        toggle debug
      </button>
    </>
  )
}

describe('TwitchPlayerPage scrolls the player into view', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(
      <AppProvider>
        <MemoryRouter initialEntries={['/twitch/streamer']}>
          <Routes>
            <Route
              path="/twitch/:channel"
              element={
                <>
                  <TwitchPlayerPage />
                  <Controls />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </AppProvider>,
    )
    // Opening the page scrolls to the top too; only what follows is under test.
    scrollTo.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const toTop = { top: 0, behavior: 'smooth' }

  it('when a clip is selected', () => {
    fireEvent.click(screen.getByText('play clip'))
    expect(scrollTo).toHaveBeenCalledWith(toTop)
  })

  it('when a VOD is selected', () => {
    fireEvent.click(screen.getByText('play vod'))
    expect(scrollTo).toHaveBeenCalledWith(toTop)
  })

  it('when going back to the live stream from a clip', () => {
    fireEvent.click(screen.getByText('play clip'))
    scrollTo.mockClear()
    fireEvent.click(screen.getByText('back to live'))
    expect(scrollTo).toHaveBeenCalledWith(toTop)
  })

  it('when the clip that is already playing is selected again', () => {
    fireEvent.click(screen.getByText('play clip'))
    scrollTo.mockClear()
    fireEvent.click(screen.getByText('play clip'))
    expect(scrollTo).toHaveBeenCalledWith(toTop)
  })

  it('but not for state changes that leave the player alone', () => {
    fireEvent.click(screen.getByText('toggle debug'))
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
