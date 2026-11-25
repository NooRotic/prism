import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import { CastContext, type CastApi } from '../../components/cast/castContext'
import { NO_CAST } from '../../lib/cast/castSender'
import TwitchPlayerPage from '../TwitchPlayerPage'

// Fill mode hides everything outside the dock row with a CSS class, so each
// section under the player must carry it. The heavy children and hooks are
// replaced: only the wrappers this page owns are under test.
vi.mock('../../contexts/AppContext', () => ({
  useApp: () => ({
    state: {
      player: { currentUrl: null, detection: null },
      // Signed out with nothing loaded: the page keeps today's layout, which is what this test is about.
      auth: { isAuthenticated: false, user: null },
      channel: { profile: null, isLive: false, videos: [] },
      loading: false,
    },
    dispatch: vi.fn(),
  }),
}))
vi.mock('../../hooks/useChannelData', () => ({ useChannelData: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: () => ({ handleAuthError: vi.fn(), isAuthenticated: false }),
}))
vi.mock('../../components/chat/ChatDock', () => ({
  default: () => <div data-testid="chat-dock" />,
}))
vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/ProfileSidebar', () => ({
  default: () => <div data-testid="profile-sidebar" />,
}))
vi.mock('../../components/channel/StatsRow', () => ({
  default: () => <div data-testid="stats-row" />,
}))
vi.mock('../../components/channel/ClipGrid', () => ({
  default: () => <div data-testid="clip-grid" />,
}))
vi.mock('../../components/channel/VODGrid', () => ({
  default: () => <div data-testid="vod-grid" />,
}))
vi.mock('../../components/layout/DebugPanel', () => ({
  default: () => <div data-testid="debug-panel" />,
}))

describe('TwitchPlayerPage in fill mode', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(
      <MemoryRouter initialEntries={['/twitch/streamer']}>
        <Routes>
          <Route path="/twitch/:channel" element={<TwitchPlayerPage />} />
        </Routes>
      </MemoryRouter>,
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['profile sidebar', 'profile-sidebar', 1],
    ['stats row', 'stats-row', 1],
    ['debug panel', 'debug-panel', 1],
    ['clips and VODs row', 'clip-grid', 2],
  ])('marks the %s section fill-hide', (_label, testId, depth) => {
    let section: HTMLElement | null = screen.getByTestId(testId)
    for (let i = 0; i < depth; i++) section = section?.parentElement ?? null
    expect(section).toHaveClass('fill-hide')
  })

  it('shares one hidden wrapper between the clip and VOD grids', () => {
    const clips = screen.getByTestId('clip-grid').parentElement?.parentElement
    const vods = screen.getByTestId('vod-grid').parentElement?.parentElement
    expect(clips).toBe(vods)
  })

  it('does not hide the dock itself', () => {
    expect(screen.getByTestId('chat-dock').closest('.fill-hide')).toBeNull()
  })
})

const CASTING = { ...NO_CAST, connected: true, device: 'TV', now: { id: 'a', name: 'News One', state: 'playing' }, load: () => {}, start: () => {}, tune: () => {}, togglePause: () => {}, stop: () => {}, clearEnded: () => {} } satisfies CastApi

it('says above the dock, while casting, that Twitch comes later', () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  render(
    <CastContext value={CASTING}>
      <MemoryRouter initialEntries={['/twitch/streamer']}>
        <Routes>
          <Route path="/twitch/:channel" element={<TwitchPlayerPage />} />
        </Routes>
      </MemoryRouter>
    </CastContext>,
  )
  const line = screen.getByText('Casting Twitch is coming soon. Your TV keeps playing News One.')
  const dock = screen.getByTestId('chat-dock')
  expect(Boolean(line.compareDocumentPosition(dock) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  expect(dock.contains(line)).toBe(false)
})
