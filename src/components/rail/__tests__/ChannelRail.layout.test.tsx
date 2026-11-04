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
 *   - on player pages the rail's collapsed width is reserved, so the strip
 *     never sits over the embed. Twitch refuses to autoplay an embed that
 *     anything is drawn over (verified 2026-11-03: a 28px button was enough).
 *     Everywhere else the rail still overlays and nothing reflows.
 */
import { fireEvent, render, screen, within } from '@testing-library/react'
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
// The player page pulls in the embed, chat and half the API layer; these
// tests only care about the shell wrapped around it.
vi.mock('../../../pages/TwitchPlayerPage', () => ({
  default: () => <div data-testid="player-page" />,
}))
vi.mock('../../../pages/ProtocolPage', () => ({
  default: () => <div data-testid="protocol-page" />,
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

describe('ChannelRail stays out of the page layout', () => {
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

  it('is marked fill-hide so fill mode can hide it', () => {
    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('channel-rail')).toHaveClass('fill-hide')
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

describe('ChannelRail reserves its collapsed width for the page', () => {
  const LEFT = '--rail-reserve-left'
  const RIGHT = '--rail-reserve-right'
  const reserved = (name: string) => document.documentElement.style.getPropertyValue(name)

  const renderRail = () =>
    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setup()
  })

  afterEach(() => {
    document.documentElement.style.removeProperty(LEFT)
    document.documentElement.style.removeProperty(RIGHT)
  })

  it('reserves the collapsed width on the edge it sits on', () => {
    renderRail()
    expect(reserved(LEFT)).toBe('56px')
    expect(reserved(RIGHT)).toBe('')
  })

  it('moves the reservation when the rail is flipped to the other edge', () => {
    renderRail()
    fireEvent.click(screen.getByLabelText('Move rail to the right'))
    expect(reserved(RIGHT)).toBe('56px')
    expect(reserved(LEFT)).toBe('')
  })

  it('gives the space back when the rail unmounts', () => {
    const { unmount } = renderRail()
    unmount()
    expect(reserved(LEFT)).toBe('')
    expect(reserved(RIGHT)).toBe('')
  })

  it('reserves nothing while it renders nothing (signed in, nothing to show)', () => {
    vi.mocked(useFollowedChannels).mockReturnValue({
      data: [],
      totalCount: 0,
      loadedCount: 0,
      liveCount: 0,
      loading: false,
      loadingMore: false,
      error: null,
      cursor: null,
      refetch: vi.fn(),
      loadMore: vi.fn(),
    } as unknown as ReturnType<typeof useFollowedChannels>)

    renderRail()

    expect(screen.queryByTestId('channel-rail')).not.toBeInTheDocument()
    expect(reserved(LEFT)).toBe('')
    expect(reserved(RIGHT)).toBe('')
  })
})

describe('the app shell keeps the player clear of the rail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setup()
  })

  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  it('pads the route content by the rail reservation on player pages', () => {
    window.history.pushState({}, '', '/twitch/somechannel')
    render(<App />)

    const gutter = screen.getByTestId('rail-gutter')
    expect(gutter).toHaveClass('pl-(--rail-reserve-left)', 'pr-(--rail-reserve-right)')
    expect(within(gutter).getByTestId('player-page')).toBeInTheDocument()
  })

  // The listing pages (/twitch, /youtube, /hls-dash) put a nav sidebar flush
  // against the left edge. Overlaying the rail there hides the first 56px of
  // every nav label (measured on /hls-dash, 2026-11-04: rail x 0-56, links x 0-219).
  it.each(['/twitch', '/youtube', '/hls-dash'])(
    'pads the route content by the rail reservation on the %s listing page, whose sidebar sits at the edge',
    (path) => {
      window.history.pushState({}, '', path)
      render(<App />)

      const gutter = screen.getByTestId('rail-gutter')
      expect(gutter).toHaveClass('pl-(--rail-reserve-left)', 'pr-(--rail-reserve-right)')
      expect(within(gutter).getByTestId('protocol-page')).toBeInTheDocument()
    },
  )

  it('leaves other pages unpadded, so the rail still just overlays there', () => {
    render(<App />)

    expect(screen.getByTestId('rail-gutter')).not.toHaveClass('pl-(--rail-reserve-left)')
    expect(screen.getByTestId('rail-gutter')).not.toHaveClass('pr-(--rail-reserve-right)')
  })
})
