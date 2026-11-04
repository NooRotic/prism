/**
 * jsdom has no layout engine, so "the player's rendered width did not
 * change" is not something these tests can assert under any
 * implementation — passing or failing here says nothing about real
 * layout. The rail's true non-participation in page layout (the
 * feature's governing constraint) has to be checked visually in a
 * real browser; see task-9-brief.md Step 6.
 *
 * What this file DOES guard, and can guard meaningfully without a
 * layout engine:
 *   - the rail's root node is `position: fixed`, so it is removed from
 *     normal document flow
 *   - the rail scrolls its own content (`overflow-y-auto`) instead of
 *     growing the page
 *   - the rail is actually mounted in the real app shell (`src/App.tsx`),
 *     so deleting the mount line is caught by a test, not only by eye
 */
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import App from '../../../App'
import ChannelRail from '../ChannelRail'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useCategoryRail } from '../../../hooks/useCategoryRail'
import { useRailAvatars } from '../../../hooks/useRailAvatars'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { useApp } from '../../../contexts/AppContext'

vi.mock('../../../hooks/useFollowedChannels', async (importOriginal) => {
  // FollowingPanel (rendered by the real <App />) also imports the real,
  // pure `sortFollows` from this module — only the data-fetching hook
  // itself needs to be replaced.
  const actual =
    await importOriginal<typeof import('../../../hooks/useFollowedChannels')>()
  return { ...actual, useFollowedChannels: vi.fn() }
})
vi.mock('../../../hooks/useCategoryRail', () => ({ useCategoryRail: vi.fn() }))
vi.mock('../../../hooks/useRailAvatars', () => ({ useRailAvatars: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../../contexts/AppContext', () => ({
  useApp: vi.fn(),
  AppProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('../../../components/ui/MatrixRainBackground', () => ({
  default: () => null,
}))

function setup() {
  vi.mocked(useTwitchAuth).mockReturnValue({
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    token: 'tok',
    handleAuthError: vi.fn(),
  } as unknown as ReturnType<typeof useTwitchAuth>)

  vi.mocked(useApp).mockReturnValue({
    state: {
      auth: { isAuthenticated: true, token: 'tok', user: { id: 'me' } },
      channel: { stream: null, profile: null },
      navPanel: {
        open: null,
        followingSort: { mode: 'live-first', dir: 'desc' },
        category: null,
      },
      search: { query: '', history: [] },
      // The real <Header /> in the shell reads the debug toggle from here.
      player: { debugMode: false },
    },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)

  vi.mocked(useFollowedChannels).mockReturnValue({
    data: [
      {
        broadcaster_id: '1',
        broadcaster_login: 'chan1',
        broadcaster_name: 'Chan1',
        followed_at: '2026-01-01T00:00:00Z',
        isLive: true,
        viewerCount: 10,
      },
    ],
    totalCount: 1,
    loadedCount: 1,
    liveCount: 1,
    loading: false,
    loadingMore: false,
    error: null,
    cursor: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  } as unknown as ReturnType<typeof useFollowedChannels>)

  vi.mocked(useCategoryRail).mockReturnValue({
    streams: [],
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useCategoryRail>)

  vi.mocked(useRailAvatars).mockReturnValue(new Map())
}

describe('ChannelRail does not cost the player any width', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setup()
  })

  it('is mounted in the app shell, so every route gets the rail', () => {
    render(<App />)
    expect(screen.getByTestId('channel-rail')).toBeInTheDocument()
  })

  it('is removed from flow, so no ancestor needs to know it exists', () => {
    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )
    const style = screen.getByTestId('channel-rail').style
    expect(style.position).toBe('fixed')
  })

  it('scrolls internally rather than growing the page', () => {
    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('channel-rail')).toHaveClass('overflow-y-auto')
  })
})
