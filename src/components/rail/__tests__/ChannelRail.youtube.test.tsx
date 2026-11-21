import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChannelRail from '../ChannelRail'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useRailAvatars } from '../../../hooks/useRailAvatars'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { useYoutubeLive } from '../../../hooks/useYoutubeLive'
import { useApp } from '../../../contexts/AppContext'

vi.mock('../../../hooks/useFollowedChannels', () => ({ useFollowedChannels: vi.fn() }))
vi.mock('../../../hooks/useRailAvatars', () => ({ useRailAvatars: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../../hooks/useYoutubeLive', () => ({ useYoutubeLive: vi.fn() }))
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))

const stream = { channelId: 'UC1', channelTitle: 'Yt Chan', videoId: 'vid1', title: 'on air', viewerCount: 9, startedAt: null, avatarUrl: '' }
const twitchLive = {
  broadcaster_id: '1', broadcaster_login: 'tw1', broadcaster_name: 'Tw1', followed_at: '2026-01-01T00:00:00Z',
  isLive: true, viewerCount: 5, gameName: 'g', streamTitle: 't', thumbnailUrl: '', startedAt: '2026-09-22T00:00:00Z',
}

function setup(opts: { signedIn: boolean; twitch?: unknown[]; youtubeAvailable?: boolean; streams?: unknown[] }) {
  const { signedIn, twitch = [], youtubeAvailable = true, streams = [] } = opts
  vi.mocked(useTwitchAuth).mockReturnValue({ isAuthenticated: signedIn, login: vi.fn(), handleAuthError: vi.fn() } as unknown as ReturnType<typeof useTwitchAuth>)
  vi.mocked(useApp).mockReturnValue({
    state: { auth: { isAuthenticated: signedIn, user: signedIn ? { id: 'me' } : null }, channel: { stream: null, profile: null } },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
  vi.mocked(useFollowedChannels).mockReturnValue({
    data: twitch, loading: false, error: null, cursor: null, refetch: vi.fn(), loadMore: vi.fn(),
  } as unknown as ReturnType<typeof useFollowedChannels>)
  vi.mocked(useRailAvatars).mockReturnValue(new Map())
  vi.mocked(useYoutubeLive).mockReturnValue({
    available: youtubeAvailable, streams, checkedAt: null, status: 'idle', allowance: { ok: true },
    quotaReached: false, now: Date.now(), check: vi.fn(),
  } as unknown as ReturnType<typeof useYoutubeLive>)
  return render(
    <MemoryRouter initialEntries={['/twitch/x']}>
      <ChannelRail />
    </MemoryRouter>,
  )
}

describe('ChannelRail — YouTube section', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows no YouTube section when no subscriptions were imported', () => {
    setup({ signedIn: true, twitch: [twitchLive], youtubeAvailable: false })
    expect(screen.queryByRole('region', { name: 'YouTube' })).not.toBeInTheDocument()
  })

  it('shows the YouTube section under Following, with the Twitch list untouched', () => {
    setup({ signedIn: true, twitch: [twitchLive], streams: [stream] })
    expect(screen.getByRole('region', { name: 'Following' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'YouTube' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Yt Chan' })).toHaveAttribute('href', '/youtube/vid1')
  })

  it('keeps the rail up for the Check live button when nobody on Twitch is live', () => {
    setup({ signedIn: true, twitch: [] })
    expect(screen.getByTestId('channel-rail')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check live' })).toBeInTheDocument()
  })

  it('shows the YouTube section for a viewer who never connected Twitch, under the Twitch prompt', () => {
    setup({ signedIn: false, streams: [stream] })
    expect(screen.getByRole('button', { name: 'Connect Twitch to see your live follows' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'YouTube' })).toBeInTheDocument()
  })

  it('stays hidden when signed in, nobody is live and no subscriptions were imported', () => {
    setup({ signedIn: true, twitch: [], youtubeAvailable: false })
    expect(screen.queryByTestId('channel-rail')).not.toBeInTheDocument()
  })
})
