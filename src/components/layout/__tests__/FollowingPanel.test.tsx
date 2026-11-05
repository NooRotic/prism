import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import FollowingPanel from '../FollowingPanel'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useApp } from '../../../contexts/AppContext'

// The follows are shared with the rail and kept fresh by lib/followsStore, so
// the panel's job is only to read them, and to ask for a refresh when opened.
vi.mock('../../../hooks/useFollowedChannels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useFollowedChannels')>()
  return { ...actual, useFollowedChannels: vi.fn() }
})
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: () => ({ handleAuthError: vi.fn() }),
}))
vi.mock('../FollowedChannelCard', () => ({
  default: ({ follow }: { follow: { broadcaster_name: string } }) => (
    <div data-testid="follow-card">{follow.broadcaster_name}</div>
  ),
}))

const mockFollows = vi.mocked(useFollowedChannels)
const mockApp = vi.mocked(useApp)
const refreshLive = vi.fn()

function setApp(open: 'following' | null) {
  mockApp.mockReturnValue({
    state: {
      navPanel: {
        open,
        followingSort: { mode: 'live-first', dir: 'desc' },
        category: null,
      },
      auth: { user: { id: 'me' } },
    },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
}

function setFollows(overrides: Partial<ReturnType<typeof useFollowedChannels>> = {}) {
  mockFollows.mockReturnValue({
    data: [],
    totalCount: 0,
    loadedCount: 0,
    liveCount: 0,
    loading: false,
    loadingMore: false,
    error: null,
    cursor: null,
    refetch: vi.fn(),
    refreshLive,
    loadMore: vi.fn(),
    ...overrides,
  })
}

describe('FollowingPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setFollows()
  })

  it('reads the shared follows even while it is closed, so it opens with data already in hand', () => {
    setApp(null)
    render(<FollowingPanel />)

    expect(mockFollows).toHaveBeenCalled()
    for (const [userId] of mockFollows.mock.calls) {
      expect(userId).toBe('me')
    }
  })

  it('asks for a refresh when it opens, and not while it is closed', () => {
    setApp(null)
    const { rerender } = render(<FollowingPanel />)
    expect(refreshLive).not.toHaveBeenCalled()

    setApp('following')
    rerender(<FollowingPanel />)

    expect(refreshLive).toHaveBeenCalledTimes(1)
  })

  it('shows the follows it already has without a loading state', () => {
    setApp('following')
    setFollows({
      data: [
        {
          broadcaster_id: '1',
          broadcaster_login: 'one',
          broadcaster_name: 'One',
          followed_at: '2026-01-01T00:00:00Z',
          isLive: true,
          viewerCount: 5,
        },
      ],
      totalCount: 1,
      loadedCount: 1,
      liveCount: 1,
    })
    render(<FollowingPanel />)

    expect(screen.getByTestId('follow-card')).toHaveTextContent('One')
    expect(screen.queryByText(/loading followed channels/i)).not.toBeInTheDocument()
  })
})
