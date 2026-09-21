import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import ProfileSidebar from '../ProfileSidebar'
import type {
  TwitchUser,
  TwitchChannel,
  TwitchStream,
} from '../../../types/twitch'

const profile: TwitchUser = {
  id: '1',
  login: 'audrareins',
  display_name: 'AudraReins',
  type: '',
  broadcaster_type: 'partner',
  description: 'test channel',
  profile_image_url: 'https://example.test/avatar.png',
  offline_image_url: '',
  view_count: 0,
  created_at: '2020-01-01T00:00:00Z',
}

const channelInfo: TwitchChannel = {
  broadcaster_id: '1',
  broadcaster_login: 'audrareins',
  broadcaster_name: 'AudraReins',
  broadcaster_language: 'en',
  game_id: '99',
  game_name: 'Borderlands 4',
  title: 'GRWM then games',
  delay: 0,
  tags: [],
  content_classification_labels: [],
  is_branded_content: false,
}

function makeStream(overrides: Partial<TwitchStream> = {}): TwitchStream {
  return {
    id: 's1',
    user_id: '1',
    user_login: 'audrareins',
    user_name: 'AudraReins',
    game_id: '99',
    game_name: 'Borderlands 4',
    type: 'live',
    title: 'GRWM then games',
    viewer_count: 59,
    started_at: '2026-09-20T07:24:42Z',
    language: 'en',
    thumbnail_url: '',
    is_mature: true,
    tags: [],
    ...overrides,
  }
}

function Seed({ stream }: { stream: TwitchStream | null }) {
  const { dispatch } = useApp()
  useEffect(() => {
    dispatch({
      type: 'LOAD_CHANNEL_SUCCESS',
      payload: {
        profile,
        channelInfo,
        stream,
        clips: [],
        videos: [],
        emotes: [],
        badges: [],
        games: new Map(),
      },
    })
  }, [dispatch, stream])
  return null
}

function SeedDetection({ channelName }: { channelName: string }) {
  const { dispatch } = useApp()
  useEffect(() => {
    dispatch({
      type: 'PLAY_URL',
      url: `https://twitch.tv/${channelName}`,
      detection: {
        type: 'twitch',
        platform: 'twitch-stream',
        originalUrl: `https://twitch.tv/${channelName}`,
        playableUrl: `https://twitch.tv/${channelName}`,
        metadata: { channelName },
      },
    })
  }, [dispatch, channelName])
  return null
}

function renderSidebar(stream: TwitchStream | null) {
  return render(
    <AppProvider>
      <Seed stream={stream} />
      <ProfileSidebar />
    </AppProvider>,
  )
}

describe('ProfileSidebar live row', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    // 4h 35m 18s after the fixture's started_at.
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows stream uptime beside the LIVE badge and viewer count', () => {
    renderSidebar(makeStream())

    expect(screen.getByText('LIVE')).toBeInTheDocument()
    expect(screen.getByText('59')).toBeInTheDocument()
    expect(screen.getByText('4:35:18')).toBeInTheDocument()
  })

  it('keeps uptime in the same row as LIVE and the viewer count', () => {
    renderSidebar(makeStream())

    const liveRow = screen.getByText('LIVE').parentElement!
    expect(liveRow.textContent).toContain('59')
    expect(liveRow.textContent).toContain('4:35:18')
  })

  it('renders no uptime when the channel is offline', () => {
    renderSidebar(null)

    expect(screen.queryByText('LIVE')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Live for/)).not.toBeInTheDocument()
  })

  it('renders no uptime when the stream payload is not type live', () => {
    renderSidebar(makeStream({ type: '' }))

    expect(screen.queryByLabelText(/^Live for/)).not.toBeInTheDocument()
  })
})

describe('ProfileSidebar when signed out', () => {
  // Signed out, useChannelData never fetches, so profile stays null. The
  // sidebar used to return null here, which is why the page showed no live
  // dot, viewer count or uptime at all.
  function renderSignedOut() {
    return render(
      <AppProvider>
        <SeedDetection channelName="hasanabi" />
        <ProfileSidebar />
      </AppProvider>,
    )
  }

  it('still names the channel being watched', () => {
    renderSignedOut()
    expect(screen.getByText(/hasanabi/i)).toBeInTheDocument()
  })

  it('explains what connecting unlocks rather than rendering nothing', () => {
    const { container } = renderSignedOut()
    expect(container).not.toBeEmptyDOMElement()
    expect(
      screen.getByRole('button', { name: /connect twitch/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/live status, viewers and stream uptime/i),
    ).toBeInTheDocument()
  })

  it('does not fabricate a live badge or viewer count', () => {
    renderSignedOut()
    expect(screen.queryByText('LIVE')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Live for/)).not.toBeInTheDocument()
  })
})
