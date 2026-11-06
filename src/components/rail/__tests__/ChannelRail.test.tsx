import { render, screen, act, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ChannelRail from '../ChannelRail'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useRailAvatars } from '../../../hooks/useRailAvatars'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { useApp } from '../../../contexts/AppContext'

vi.mock('../../../hooks/useFollowedChannels', () => ({
  useFollowedChannels: vi.fn(),
}))
vi.mock('../../../hooks/useRailAvatars', () => ({ useRailAvatars: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))

const mockFollows = vi.mocked(useFollowedChannels)
const mockAvatars = vi.mocked(useRailAvatars)
const mockAuth = vi.mocked(useTwitchAuth)
const mockApp = vi.mocked(useApp)

const dispatch = vi.fn()

function live(i: number) {
  return {
    broadcaster_id: `${i}`,
    broadcaster_login: `chan${i}`,
    broadcaster_name: `Chan${i}`,
    followed_at: '2026-01-01T00:00:00Z',
    isLive: true,
    viewerCount: 100 - i,
    gameName: 'Just Chatting',
    streamTitle: `t${i}`,
    thumbnailUrl: '',
    startedAt: '2026-09-22T00:00:00Z',
  }
}

function offline(i: number) {
  return {
    broadcaster_id: `off${i}`,
    broadcaster_login: `off${i}`,
    broadcaster_name: `Off${i}`,
    followed_at: '2026-01-01T00:00:00Z',
    isLive: false,
  }
}

interface SetupOptions {
  isAuthenticated?: boolean
  follows?: ReturnType<typeof live>[]
  followsError?: string | null
  /** A category in context (the stream being watched), which no longer adds anything to the rail. */
  gameId?: string | null
  loading?: boolean
  /** The follows store's next-page cursor: non-null means more follows are still to load. */
  cursor?: string | null
  /**
   * Defaults to a Twitch channel route so `gameId`-bearing setups keep
   * exercising the category path without every call site having to know
   * about route gating. Override to test route-dependent behavior itself.
   */
  path?: string
}

function setup(opts: SetupOptions = {}) {
  const {
    isAuthenticated = true,
    follows = [live(0), live(1)],
    followsError = null,
    gameId = null,
    loading = false,
    cursor = null,
    path = '/twitch/testchannel',
  } = opts

  mockAuth.mockReturnValue({
    isAuthenticated,
    login: vi.fn(),
    logout: vi.fn(),
    token: isAuthenticated ? 'tok' : null,
    handleAuthError: vi.fn(),
  } as unknown as ReturnType<typeof useTwitchAuth>)

  mockApp.mockReturnValue({
    state: {
      auth: { isAuthenticated, token: null, user: isAuthenticated ? { id: 'me' } : null },
      channel: {
        stream: gameId ? { game_id: gameId, user_id: 'current' } : null,
        profile: null,
      },
    },
    dispatch,
  } as unknown as ReturnType<typeof useApp>)

  mockFollows.mockReturnValue({
    data: follows,
    totalCount: follows.length,
    loadedCount: follows.length,
    liveCount: follows.filter((f) => f.isLive).length,
    loading,
    loadingMore: false,
    error: followsError,
    cursor,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  } as unknown as ReturnType<typeof useFollowedChannels>)

  mockAvatars.mockReturnValue(new Map())

  // MemoryRouter caches its history in a ref on first mount and never
  // re-reads `initialEntries` after that, so a route-changing test must key
  // it by path to force a remount when it calls `rerender` with a new one.
  return render(
    <MemoryRouter key={path} initialEntries={[path]}>
      <ChannelRail />
    </MemoryRouter>,
  )
}

function rail() {
  return screen.getByTestId('channel-rail')
}

describe('ChannelRail — layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('is a fixed overlay that takes no layout space', () => {
    setup()
    expect(rail()).toHaveStyle({ position: 'fixed' })
  })

  it('sits above the player but below the slide-down panels', () => {
    setup()
    // SlidedownPanel is zIndex 30; Header is z-40. The rail's own +N opens
    // the panel, so the panel must cover the rail.
    expect(rail()).toHaveStyle({ zIndex: '25' })
  })

  it('pins to the left edge by default', () => {
    setup()
    expect(rail()).toHaveStyle({ left: '0px' })
  })

  it('flips to the right edge and persists the choice', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /move rail/i }))

    expect(rail()).toHaveStyle({ right: '0px' })
    expect(localStorage.getItem('prism_rail_position')).toBe('right')
  })
})

describe('ChannelRail — expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => vi.useRealTimers())

  it('does not expand before the open delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(60))
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  // setup() defaults to a channel page, where opening slides the page over and so waits longer
  // (see ChannelRail.layout.test.tsx). Pages with no player keep the short delay.
  it('expands on hover once the open delay elapses on a page with no player', () => {
    setup({ path: '/' })
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('expands on hover once the longer open delay elapses on a channel page', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(500))
    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('expands on keyboard focus entering the rail', () => {
    setup()
    fireEvent.focusIn(rail())
    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('expands on tap', () => {
    setup()
    fireEvent.touchStart(rail())
    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('does not collapse before the close delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(500))

    fireEvent.mouseLeave(rail())
    act(() => void vi.advanceTimersByTime(100))

    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('collapses on mouse leave once the close delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(500))

    fireEvent.mouseLeave(rail())
    act(() => void vi.advanceTimersByTime(300))

    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  it('collapses on focus leaving the rail', () => {
    setup()
    fireEvent.focusIn(rail())
    fireEvent.focusOut(rail())
    act(() => void vi.advanceTimersByTime(300))
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  it('collapses on Escape', () => {
    setup()
    fireEvent.focusIn(rail())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  it('collapses on a tap outside the rail', () => {
    setup()
    fireEvent.touchStart(rail())
    expect(screen.getByText('Chan0')).toBeInTheDocument()

    fireEvent.touchStart(document.body)
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })
})

describe('ChannelRail — content and states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows a connect prompt and fetches nothing when signed out', () => {
    setup({ isAuthenticated: false })
    fireEvent.focusIn(rail())

    expect(screen.getByRole('button', { name: /connect twitch/i })).toBeInTheDocument()
    // The follows hook must be called with a null userId, which makes it a no-op.
    expect(mockFollows).toHaveBeenCalledWith(null, expect.anything())
  })

  it('renders one entry per live follow and excludes offline follows', () => {
    setup({ follows: [live(0), offline(1), live(2)] as never })
    fireEvent.focusIn(rail())

    expect(screen.getByText('Chan0')).toBeInTheDocument()
    expect(screen.getByText('Chan2')).toBeInTheDocument()
    expect(screen.queryByText('Off1')).not.toBeInTheDocument()
  })

  // The owner found the category leaders not useful (2026-11-06): the rail is
  // the people you follow, nothing else.
  it('never shows category leaders, even with a category in context', () => {
    setup({ gameId: '509658' })
    fireEvent.focusIn(rail())

    expect(screen.queryByRole('region', { name: /category/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('region')).toHaveLength(1)
    expect(screen.getByRole('region', { name: /following/i })).toBeInTheDocument()
  })

  it('renders nothing when signed in and nobody followed is live', () => {
    setup({ follows: [offline(0), offline(1)] as never })
    expect(screen.queryByTestId('channel-rail')).not.toBeInTheDocument()
  })

  it('renders nothing when the follows fail to load', () => {
    setup({ follows: [], followsError: 'Twitch API error: 500' })
    expect(screen.queryByTestId('channel-rail')).not.toBeInTheDocument()
  })

  it('shows every live follow, with no cap', () => {
    setup({ follows: Array.from({ length: 30 }, (_, i) => live(i)) })
    fireEvent.focusIn(rail())

    const region = screen.getByRole('region', { name: /following/i })
    expect(within(region).getAllByRole('link')).toHaveLength(30)
  })

  it('lists live follows with the newest to go live first', () => {
    setup({
      follows: [
        { ...live(0), startedAt: '2026-11-05T08:00:00Z' },
        { ...live(1), startedAt: '2026-11-05T12:00:00Z' },
        { ...live(2), startedAt: '2026-11-05T10:00:00Z' },
      ],
    })
    fireEvent.focusIn(rail())

    const region = screen.getByRole('region', { name: /following/i })
    expect(within(region).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/twitch/chan1',
      '/twitch/chan2',
      '/twitch/chan0',
    ])
  })

  it('asks for an avatar for every live follow it shows, and no more', () => {
    setup({
      follows: [...Array.from({ length: 30 }, (_, i) => live(i)), offline(0), offline(1)] as never,
    })

    const requested = mockAvatars.mock.calls.at(-1)?.[0] ?? []
    expect([...requested].sort()).toEqual(Array.from({ length: 30 }, (_, i) => `${i}`).sort())
  })

  describe('offline follows', () => {
    const mixed = [live(0), live(1), offline(0), offline(1), offline(2)] as never

    it('ends the rail with a button counting the follows who are not live', () => {
      setup({ follows: mixed })
      expect(screen.getByRole('button', { name: /3 offline/i })).toBeInTheDocument()
    })

    it('puts that button after the live follows', () => {
      setup({ follows: mixed })
      const lastLink = screen.getAllByRole('link').at(-1)!
      const button = screen.getByRole('button', { name: /3 offline/i })
      expect(lastLink.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it('opens the Following panel when pressed', async () => {
      const user = userEvent.setup()
      setup({ follows: mixed })
      fireEvent.focusIn(rail())

      await user.click(screen.getByRole('button', { name: /3 offline/i }))

      expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_NAV_PANEL', panel: 'following' })
    })

    it('is not shown when everyone followed is live', () => {
      setup({ follows: [live(0), live(1)] })
      expect(screen.queryByRole('button', { name: /offline/i })).not.toBeInTheDocument()
    })

    it('adds a plus when more follows are still to be loaded, since the count is then a floor', () => {
      setup({ follows: mixed, cursor: 'next-page' })
      expect(screen.getByRole('button', { name: /3\+ offline/i })).toBeInTheDocument()
    })

    it('puts only the count on the collapsed rail and adds the word offline when it opens', () => {
      setup({ follows: mixed })
      const button = screen.getByRole('button', { name: /3 offline/i })
      expect(button).toHaveTextContent('3')
      expect(button).not.toHaveTextContent(/offline/i)

      fireEvent.focusIn(rail())
      expect(screen.getByRole('button', { name: /3 offline/i })).toHaveTextContent(/offline/i)
    })
  })

  it('shows dimmed placeholder circles while follows are loading', () => {
    setup({ follows: [], loading: true })

    expect(screen.getByTestId('channel-rail')).toBeInTheDocument()
    expect(screen.getAllByTestId('rail-placeholder')).toHaveLength(5)
  })

  // This exercises a *transition*, not a static mock — the bug class the
  // whole-branch review found (auth going stale under a rail that never
  // unmounts) is invisible to a render-once test by construction.

  it('reacts to a logout: hides stale follows and shows the signed-out affordance', () => {
    const { rerender } = setup({ follows: [live(0), live(1)] })
    fireEvent.focusIn(rail())
    expect(screen.getByText('Chan0')).toBeInTheDocument()

    // The Header's own useTwitchAuth() instance is what would call
    // logout() in the app; that only ever touches AppContext. The rail's
    // *own* useTwitchAuth() mock is deliberately left unchanged here —
    // still reporting authenticated — mirroring the real per-instance hook
    // staying frozen after another instance's logout. Only state.auth
    // updates, same as the real LOGOUT reducer case.
    mockApp.mockReturnValue({
      state: {
        auth: { isAuthenticated: false, token: null, user: null },
        channel: { stream: null, profile: null },
      },
      dispatch,
    } as unknown as ReturnType<typeof useApp>)

    rerender(
      <MemoryRouter key="/twitch/testchannel" initialEntries={['/twitch/testchannel']}>
        <ChannelRail />
      </MemoryRouter>,
    )
    fireEvent.focusIn(rail())

    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect twitch/i })).toBeInTheDocument()
  })
})

