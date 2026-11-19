import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HlsPage from '../HlsPage'
import { useApp } from '../../contexts/AppContext'
import { FloatingVideoContext } from '../../components/chat/floatingVideoContext'
import type { FloatingVideoControls } from '../../components/chat/floatingVideoContext'
import { buildStreamPath } from '../../lib/routes'

vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div data-testid="player-host" /> }))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => null }))
vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))

const controls = (over: Partial<FloatingVideoControls> = {}): FloatingVideoControls => ({
  supported: true,
  canOpen: true,
  isFloating: false,
  blocked: false,
  failed: false,
  open: vi.fn(),
  close: vi.fn(),
  registerSource: vi.fn(),
  ...over,
})

function renderAt(entry: string, video: FloatingVideoControls) {
  return render(
    <FloatingVideoContext.Provider value={video}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="hls-dash/:streamId?" element={<HlsPage />} />
        </Routes>
      </MemoryRouter>
    </FloatingVideoContext.Provider>,
  )
}

beforeEach(() => {
  vi.mocked(useApp).mockReturnValue({
    state: { player: { currentUrl: null, detection: null, debugMode: false } },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
})
afterEach(cleanup)

describe('HlsPage: pop-out', () => {
  it('tells the floating window which stream it shows, as the type the page plays it', () => {
    const video = controls()
    renderAt(buildStreamPath('https://h/x.m3u8', 'dash'), video)
    expect(video.registerSource).toHaveBeenLastCalledWith({ kind: 'stream', url: 'https://h/x.m3u8', streamKind: 'dash' })
  })

  it('withdraws when the page goes away', () => {
    const video = controls()
    const { unmount } = renderAt(buildStreamPath('https://h/x.m3u8'), video)
    unmount()
    expect(video.registerSource).toHaveBeenLastCalledWith(null)
  })

  it('opens the window from the button, from the beginning (a stream has no position)', () => {
    const video = controls()
    renderAt(buildStreamPath('https://h/x.m3u8'), video)
    fireEvent.click(screen.getByRole('button', { name: 'Pop out video' }))
    expect(video.open).toHaveBeenCalledWith({ startSec: undefined })
  })

  it('has no button where the browser cannot float a video', () => {
    renderAt(buildStreamPath('https://h/x.m3u8'), controls({ supported: false, canOpen: false }))
    expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
  })

  it('takes the player out of the page while the window plays', () => {
    renderAt(buildStreamPath('https://h/x.m3u8'), controls({ isFloating: true, canOpen: false }))
    expect(screen.queryByTestId('player-host')).not.toBeInTheDocument()
    expect(screen.getByTestId('floating-panel')).toBeInTheDocument()
  })
})
