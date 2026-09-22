import { render, screen, fireEvent, act } from '@testing-library/react'
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

  it('leaves a sibling player element the same width when it expands', () => {
    render(
      <MemoryRouter>
        <div data-testid="player" style={{ width: '1000px' }}>
          player
        </div>
        <ChannelRail />
      </MemoryRouter>,
    )

    const player = screen.getByTestId('player')
    const before = player.style.width

    fireEvent.focusIn(screen.getByTestId('channel-rail'))
    act(() => {})

    expect(player.style.width).toBe(before)
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

  it('does not touch the persisted player/chat split ratio', () => {
    localStorage.setItem('prism_panel_ratio', '0.72')

    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )
    fireEvent.focusIn(screen.getByTestId('channel-rail'))
    act(() => {})

    expect(localStorage.getItem('prism_panel_ratio')).toBe('0.72')
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
