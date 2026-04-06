import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import ClipCard from '../ClipCard'
import type { TwitchClip, TwitchGame } from '../../../types/twitch'

vi.mock('../../../lib/urlDetection', () => ({
  detectURLType: vi.fn((url: string) => ({
    type: 'twitch',
    platform: 'twitch-clip',
    originalUrl: url,
    playableUrl: url,
    metadata: { clipId: 'TestClipId123' },
  })),
}))

const mockClip: TwitchClip = {
  id: 'TestClipId123',
  url: 'https://clips.twitch.tv/TestClipId123',
  embed_url: 'https://clips.twitch.tv/embed?clip=TestClipId123',
  broadcaster_id: '12345',
  broadcaster_name: 'TestStreamer',
  creator_id: '67890',
  creator_name: 'ClipCreatorGuy',
  video_id: 'v111',
  game_id: 'g001',
  language: 'en',
  title: 'Amazing Play of the Year',
  view_count: 42069,
  created_at: '2025-01-15T00:00:00Z',
  thumbnail_url: 'https://example.com/thumb.jpg',
  duration: 30,
  vod_offset: 1200,
}

const mockGame: TwitchGame = {
  id: 'g001',
  name: 'Overwatch 2',
  box_art_url: 'https://example.com/boxart-{width}x{height}.jpg',
  igdb_id: '',
}

// Helper to capture dispatched actions
function DispatchSpy({ onAction }: { onAction: (action: unknown) => void }) {
  const { state } = useApp()
  // We read state.player to detect changes
  onAction(state.player)
  return null
}

function renderClipCard(game?: TwitchGame) {
  return render(
    <AppProvider>
      <ClipCard clip={mockClip} game={game} />
    </AppProvider>,
  )
}

describe('ClipCard', () => {
  it('renders clip title', () => {
    renderClipCard()
    expect(screen.getByText('Amazing Play of the Year')).toBeInTheDocument()
  })

  it('renders creator name', () => {
    renderClipCard()
    expect(screen.getByText('ClipCreatorGuy')).toBeInTheDocument()
  })

  it('renders view count formatted', () => {
    renderClipCard()
    expect(screen.getByText('42,069')).toBeInTheDocument()
  })

  it('dispatches PLAY_URL with correct clip URL on click', async () => {
    let capturedPlayerState: { currentUrl: string } | null = null

    render(
      <AppProvider>
        <ClipCard clip={mockClip} />
        <DispatchSpy onAction={(ps) => { capturedPlayerState = ps as { currentUrl: string } }} />
      </AppProvider>,
    )

    const user = userEvent.setup()
    await user.click(screen.getByRole('button'))

    expect(capturedPlayerState).not.toBeNull()
    expect(capturedPlayerState!.currentUrl).toBe('https://clips.twitch.tv/TestClipId123')
  })

  it('shows game box art when game prop is provided', () => {
    renderClipCard(mockGame)
    const boxArtImg = screen.getByAltText('Overwatch 2')
    expect(boxArtImg).toBeInTheDocument()
    expect(boxArtImg).toHaveAttribute(
      'src',
      'https://example.com/boxart-28x38.jpg',
    )
  })

  it('does not show game box art when game prop is omitted', () => {
    renderClipCard()
    expect(screen.queryByAltText('Overwatch 2')).not.toBeInTheDocument()
  })
})
