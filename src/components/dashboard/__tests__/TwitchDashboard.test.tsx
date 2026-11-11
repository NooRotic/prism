import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TwitchDashboard from '../TwitchDashboard'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useApp } from '../../../contexts/AppContext'
import type { EnrichedFollow } from '../../../lib/followsStore'
import type { TwitchUser } from '../../../types/twitch'

const { onSessionExpired } = vi.hoisted(() => ({ onSessionExpired: vi.fn() }))

vi.mock('../../../hooks/useFollowedChannels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useFollowedChannels')>()
  return { ...actual, useFollowedChannels: vi.fn() }
})
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../../hooks/useSessionExpiry', () => ({ useSessionExpiry: () => onSessionExpired }))
vi.mock('../useChatColor', () => ({ useChatColor: () => '#FF7F50' }))

const mockFollows = vi.mocked(useFollowedChannels)
const mockApp = vi.mocked(useApp)
const dispatch = vi.fn()
const refetch = vi.fn()

const MIN = 60_000

const me: TwitchUser = {
  id: 'me',
  login: 'yourname',
  display_name: 'YourName',
  type: '',
  broadcaster_type: '',
  description: '',
  profile_image_url: 'https://img.test/me.png',
  offline_image_url: '',
  view_count: 0,
  created_at: '2016-03-04T00:00:00Z',
}

function liveFollow(name: string, minutesAgo: number, overrides: Partial<EnrichedFollow> = {}): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2022-01-01T00:00:00Z',
    isLive: true,
    viewerCount: 100,
    gameName: 'Just Chatting',
    language: 'en',
    thumbnailUrl: 'https://img.test/{width}x{height}.jpg',
    startedAt: new Date(Date.now() - minutesAgo * MIN).toISOString(),
    ...overrides,
  }
}

function offlineFollow(name: string): EnrichedFollow {
  return {
    broadcaster_id: name.toLowerCase(),
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2020-01-01T00:00:00Z',
    isLive: false,
  }
}

interface AuthOverrides {
  user?: TwitchUser | null
  profileError?: boolean
}

function setApp({ user = me, profileError = false }: AuthOverrides = {}) {
  mockApp.mockReturnValue({
    state: { auth: { user, profileError, expired: false, isAuthenticated: true, token: 't' } },
    dispatch,
  } as unknown as ReturnType<typeof useApp>)
}

function setFollows(overrides: Partial<ReturnType<typeof useFollowedChannels>> = {}) {
  const data = overrides.data ?? []
  mockFollows.mockReturnValue({
    data,
    totalCount: data.length,
    loadedCount: data.length,
    liveCount: data.filter((f) => f.isLive).length,
    loading: false,
    loadingMore: false,
    error: null,
    cursor: null,
    refetch,
    refreshLive: vi.fn(),
    loadMore: vi.fn(),
    ...overrides,
  })
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <TwitchDashboard />
    </MemoryRouter>,
  )
}

describe('TwitchDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setApp()
    setFollows()
  })

  it('shows a loading skeleton and no identity strip while the profile has not loaded', () => {
    setApp({ user: null })
    renderDashboard()

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
    expect(screen.queryByText('YourName')).not.toBeInTheDocument()
  })

  it('shows an error card with Retry when the profile failed to load', () => {
    setApp({ user: null, profileError: true })
    renderDashboard()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(dispatch).toHaveBeenCalledWith({ type: 'LOGIN_USER_RETRY' })
  })

  it('does not ask for follows until the profile is known', () => {
    setApp({ user: null })
    renderDashboard()

    expect(mockFollows.mock.calls.every(([userId]) => userId === null)).toBe(true)
  })

  it('shows a skeleton while the follows load for the first time', () => {
    setFollows({ loading: true })
    renderDashboard()

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('shows the error with a Retry that reloads the follows', () => {
    setFollows({ error: 'Twitch /streams request failed (HTTP 500)' })
    renderDashboard()

    expect(screen.getByText('Twitch /streams request failed (HTTP 500)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('hands the follows store a handler that signs the viewer out when the session expires', () => {
    renderDashboard()

    const options = mockFollows.mock.calls[0][1]
    options?.handleAuthError?.()

    expect(onSessionExpired).toHaveBeenCalledTimes(1)
  })

  describe('with follows loaded', () => {
    const follows = [
      offlineFollow('Quiet'),
      liveFollow('Old', 300, { viewerCount: 900, gameName: 'Valorant' }),
      liveFollow('Newest', 2, { viewerCount: 40, gameName: 'Just Chatting' }),
      liveFollow('Mid', 50, { viewerCount: 400, gameName: 'Just Chatting' }),
    ]

    it('shows the identity strip, the chips, the wall newest first, the categories and both cards', () => {
      setFollows({ data: follows })
      renderDashboard()

      expect(screen.getByText('YourName')).toBeInTheDocument()
      expect(screen.getByRole('list', { name: 'Follow stats' })).toBeInTheDocument()
      const tiles = screen.getAllByRole('link', { name: /viewers, live/ })
      expect(tiles.map((t) => t.getAttribute('href'))).toEqual(['/twitch/newest', '/twitch/mid', '/twitch/old'])
      expect(screen.getByRole('button', { name: /^Just Chatting, 2 live/ })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Just went live' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Most watched' })).toBeInTheDocument()
    })

    it('opens the category panel when a category row is clicked', () => {
      setFollows({ data: follows })
      renderDashboard()

      fireEvent.click(screen.getByRole('button', { name: /^Valorant, 1 live/ }))

      expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_CATEGORY_PANEL', category: 'Valorant' })
    })

    it('opens the Following panel from the offline line', () => {
      setFollows({ data: follows })
      renderDashboard()

      fireEvent.click(screen.getByRole('button', { name: /^1 offline/ }))

      expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_NAV_PANEL', panel: 'following' })
    })

    it('marks the counts as a floor while more follows remain, and offers no Load more', () => {
      setFollows({ data: follows, cursor: 'next-page' })
      renderDashboard()

      expect(within(screen.getByRole('list', { name: 'Follow stats' })).getByText('3 / 4+')).toBeInTheDocument()
      expect(screen.getByText('following 4+')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^1\+ offline/ })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument()
    })
  })

  it('says nobody is live and links to the Twitch directory', () => {
    setFollows({ data: [offlineFollow('A'), offlineFollow('B')] })
    renderDashboard()

    expect(screen.getByText('No one you follow is live')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Follow stats' })).getByText('0 / 2')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Twitch/ })
    expect(link).toHaveAttribute('href', 'https://www.twitch.tv/directory')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('button', { name: /^2 offline/ })).toBeInTheDocument()
  })

  it('shows a short message and the directory link, without chips, when the viewer follows no one', () => {
    setFollows({ data: [] })
    renderDashboard()

    expect(screen.getByText("You don't follow anyone on Twitch yet.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Twitch/ })).toHaveAttribute('href', 'https://www.twitch.tv/directory')
    expect(screen.queryByRole('list', { name: 'Follow stats' })).not.toBeInTheDocument()
  })
})
