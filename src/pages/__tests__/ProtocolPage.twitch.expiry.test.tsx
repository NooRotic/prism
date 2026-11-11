import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter } from 'react-router-dom'
import ProtocolPage from '../ProtocolPage'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useFollowedChannels } from '../../hooks/useFollowedChannels'
import { useStreamerHistory } from '../../hooks/useStreamerHistory'
import type { TwitchUser } from '../../types/twitch'

// The real provider, the real page, the real dashboard and the real useSessionExpiry. Only the
// data hooks are stubbed, so a "401 from a streamer call" is the callback the dashboard handed
// them, called by the test.
vi.mock('../../hooks/useFollowedChannels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useFollowedChannels')>()
  return { ...actual, useFollowedChannels: vi.fn() }
})
vi.mock('../../hooks/useTrackerSummary', () => ({ useTrackerSummary: () => ({ summary: null, loading: false }) }))
vi.mock('../../hooks/useStreamerNumbers', () => ({
  useStreamerNumbers: () => ({
    followers: { data: null, loading: false, error: null },
    subscribers: { data: null, loading: false, error: null },
  }),
}))
vi.mock('../../hooks/useStreamerHistory', () => ({ useStreamerHistory: vi.fn() }))
vi.mock('../../components/dashboard/useChatColor', () => ({ useChatColor: () => null }))
vi.mock('../../components/grid/DemoGrid', () => ({ DemoGrid: () => <div data-testid="demo-grid" /> }))
vi.mock('../../components/grid/YouTubeGrid', () => ({ YouTubeGrid: () => <div /> }))
vi.mock('../../components/search/SmartUrlInput', () => ({ SmartUrlInput: () => <div /> }))

const mockFollows = vi.mocked(useFollowedChannels)
const mockHistory = vi.mocked(useStreamerHistory)

const streamer: TwitchUser = {
  id: 'me',
  login: 'yourname',
  display_name: 'YourName',
  type: '',
  broadcaster_type: 'affiliate',
  description: '',
  profile_image_url: '',
  offline_image_url: '',
  view_count: 0,
  created_at: '2016-03-04T00:00:00Z',
}

/** Stands in for App.tsx's profile load: puts the signed-in profile into the real context. */
function SeedProfile() {
  const { dispatch } = useApp()
  useEffect(() => {
    dispatch({ type: 'LOGIN_USER_LOADED', user: streamer })
  }, [dispatch])
  return null
}

describe('a 401 from a streamer call on the Twitch page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
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
      refreshLive: vi.fn(),
      loadMore: vi.fn(),
    })
    mockHistory.mockReturnValue({
      followers: { data: null, loading: false, error: null },
      videos: { data: null, loading: false, error: null },
    })
  })

  it('signs the viewer out and replaces the dashboard with the expired sign-in card', () => {
    render(
      <AppProvider>
        <SeedProfile />
        <MemoryRouter>
          <ProtocolPage protocol="twitch" />
        </MemoryRouter>
      </AppProvider>,
    )
    expect(screen.getByRole('region', { name: 'Your channel' })).toBeInTheDocument()

    const [, onSessionExpired] = mockHistory.mock.calls.at(-1) as Parameters<typeof useStreamerHistory>
    act(() => onSessionExpired())

    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBeNull()
    expect(
      screen.getByText('Your Twitch sign-in expired. Connect again to see who you follow that is live.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your channel' })).not.toBeInTheDocument()
    expect(screen.getByTestId('demo-grid')).toBeInTheDocument()
  })
})
