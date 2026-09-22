import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ChannelRail from '../ChannelRail'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useCategoryRail } from '../../../hooks/useCategoryRail'
import { useRailAvatars } from '../../../hooks/useRailAvatars'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { useApp } from '../../../contexts/AppContext'

vi.mock('../../../hooks/useFollowedChannels', () => ({
  useFollowedChannels: vi.fn(),
}))
vi.mock('../../../hooks/useCategoryRail', () => ({ useCategoryRail: vi.fn() }))
vi.mock('../../../hooks/useRailAvatars', () => ({ useRailAvatars: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))

const mockFollows = vi.mocked(useFollowedChannels)
const mockCategory = vi.mocked(useCategoryRail)
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
  gameId?: string | null
  recommendations?: unknown[]
  loading?: boolean
}

function setup(opts: SetupOptions = {}) {
  const {
    isAuthenticated = true,
    follows = [live(0), live(1)],
    followsError = null,
    gameId = null,
    recommendations = [],
    loading = false,
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
    cursor: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  } as unknown as ReturnType<typeof useFollowedChannels>)

  mockCategory.mockReturnValue({
    streams: recommendations,
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useCategoryRail>)

  mockAvatars.mockReturnValue(new Map())

  return render(
    <MemoryRouter>
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

  it('pins to the right edge by default', () => {
    setup()
    expect(rail()).toHaveStyle({ right: '0px' })
  })

  it('flips to the left edge and persists the choice', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /move rail/i }))

    expect(rail()).toHaveStyle({ left: '0px' })
    expect(localStorage.getItem('prism_rail_position')).toBe('left')
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

  it('expands on hover once the open delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(200))
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
    act(() => void vi.advanceTimersByTime(200))

    fireEvent.mouseLeave(rail())
    act(() => void vi.advanceTimersByTime(100))

    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('collapses on mouse leave once the close delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(200))

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
    expect(mockCategory).toHaveBeenCalledWith(null, null)
  })

  it('renders one entry per live follow and excludes offline follows', () => {
    setup({ follows: [live(0), offline(1), live(2)] as never })
    fireEvent.focusIn(rail())

    expect(screen.getByText('Chan0')).toBeInTheDocument()
    expect(screen.getByText('Chan2')).toBeInTheDocument()
    expect(screen.queryByText('Off1')).not.toBeInTheDocument()
  })

  it('hides the recommendations section when there is no category in context', () => {
    setup({ gameId: null })
    fireEvent.focusIn(rail())
    expect(screen.queryByRole('region', { name: /category/i })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: /following/i })).toBeInTheDocument()
  })

  it('shows the recommendations section when a category is in context', () => {
    setup({
      gameId: '509658',
      recommendations: [
        {
          id: 's1',
          user_id: '99',
          user_login: 'rec1',
          user_name: 'Rec1',
          game_name: 'Just Chatting',
          title: 'hello',
          viewer_count: 500,
          started_at: '2026-09-22T00:00:00Z',
        },
      ],
    })
    fireEvent.focusIn(rail())
    expect(screen.getByText('Rec1')).toBeInTheDocument()
  })

  it('keeps recommendations when the follows section fails', () => {
    setup({
      follows: [],
      followsError: 'Twitch API error: 500',
      gameId: '509658',
      recommendations: [
        {
          id: 's1',
          user_id: '99',
          user_login: 'rec1',
          user_name: 'Rec1',
          game_name: 'Just Chatting',
          title: 'hello',
          viewer_count: 500,
          started_at: '2026-09-22T00:00:00Z',
        },
      ],
    })
    fireEvent.focusIn(rail())

    expect(screen.queryByRole('region', { name: /following/i })).not.toBeInTheDocument()
    expect(screen.getByText('Rec1')).toBeInTheDocument()
  })

  it('renders nothing when signed in with no content in either section', () => {
    setup({ follows: [], gameId: null })
    expect(screen.queryByTestId('channel-rail')).not.toBeInTheDocument()
  })

  it('opens the Following panel from the +N control', async () => {
    const user = userEvent.setup()
    setup({ follows: Array.from({ length: 12 }, (_, i) => live(i)) })
    fireEvent.focusIn(rail())

    await user.click(screen.getByRole('button', { name: /\+4/ }))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_NAV_PANEL',
      panel: 'following',
    })
  })

  it('excludes the current channel from recommendations', () => {
    setup({ gameId: '509658' })
    expect(mockCategory).toHaveBeenCalledWith('509658', 'current')
  })

  it('requests avatars for both live follows and recommendations', async () => {
    setup({
      follows: [live(0)],
      gameId: '509658',
      recommendations: [
        {
          id: 's1',
          user_id: '99',
          user_login: 'rec1',
          user_name: 'Rec1',
          game_name: 'JC',
          title: 't',
          viewer_count: 5,
          started_at: '2026-09-22T00:00:00Z',
        },
      ],
    })
    await waitFor(() =>
      expect(mockAvatars).toHaveBeenCalledWith(expect.arrayContaining(['0', '99'])),
    )
  })

  it('shows dimmed placeholder circles while follows are loading', () => {
    setup({ follows: [], loading: true })

    expect(screen.getByTestId('channel-rail')).toBeInTheDocument()
    expect(screen.getAllByTestId('rail-placeholder')).toHaveLength(5)
  })
})
