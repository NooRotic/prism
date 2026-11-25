import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YoutubePlayerPage from '../YoutubePlayerPage'
import { CastContext, type CastApi } from '../../components/cast/castContext'
import { NO_CAST } from '../../lib/cast/castSender'
import { useApp } from '../../contexts/AppContext'
import { FloatingVideoContext } from '../../components/chat/floatingVideoContext'
import type { FloatingVideoControls } from '../../components/chat/floatingVideoContext'
import { useRelatedVideos } from '../../hooks/useRelatedVideos'
import { useVideoComments } from '../../hooks/useVideoComments'
import { useVideoContext } from '../../hooks/useVideoContext'
import { useVideoPage } from '../../hooks/useVideoPage'
import { windowAround } from '../../lib/videoContext'
import { searchTopic, type VideoPageData } from '../../lib/videoPageApi'

vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useVideoPage', () => ({ useVideoPage: vi.fn() }))
vi.mock('../../hooks/useVideoComments', () => ({ useVideoComments: vi.fn() }))
vi.mock('../../hooks/useVideoContext', () => ({ useVideoContext: vi.fn() }))
vi.mock('../../hooks/useRelatedVideos', () => ({ useRelatedVideos: vi.fn() }))
vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div data-testid="player" /> }))
vi.mock('../../components/chat/ChatDock', () => ({
  default: ({ kind, channel, player }: { kind: string; channel: string; player: React.ReactNode }) => (
    <section data-testid="chat-dock" data-kind={kind} data-channel={channel}>
      {player}
    </section>
  ),
}))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => <div data-testid="debug" /> }))
vi.mock('../../lib/videoPageApi', async (orig) => ({ ...(await orig<object>()), searchTopic: vi.fn() }))
vi.mock('../../lib/youtubeApi', async (orig) => ({ ...(await orig<object>()), isYouTubeApiAvailable: () => true }))

const data = (over: Partial<VideoPageData> = {}): VideoPageData => ({
  id: 'abcdefghijk',
  title: 'A title',
  channelTitle: 'A channel',
  channelId: 'UC',
  thumbnail: '',
  publishedAt: '2020-01-01T00:00:00Z',
  viewCount: '10',
  description: 'the description',
  tags: ['Alpha', 'beta'],
  topics: ['alpha', 'Gamma'],
  live: { state: 'none', viewerCount: null, startedAt: null },
  ...over,
})

const items = [
  { id: 'aaaaaaaaaaa', title: 'one', thumbnail: '' },
  { id: 'abcdefghijk', title: 'two', thumbnail: '' },
]

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn()
  vi.mocked(useApp).mockReturnValue({
    state: { player: { currentUrl: 'https://www.youtube.com/watch?v=abcdefghijk', detection: { type: 'youtube' } } },
    dispatch: vi.fn(),
  } as never)
  vi.mocked(useVideoPage).mockReturnValue({ data: data(), status: 'ready' })
  vi.mocked(useVideoComments).mockReturnValue({ result: { status: 'disabled' } })
  vi.mocked(useRelatedVideos).mockReturnValue({ videos: [{ id: 'rrrrrrrrrrr', title: 'a related one', channel: 'c', publishedAt: '', durationSec: 60, thumbnail: '' }], status: 'ready' })
  vi.mocked(useVideoContext).mockReturnValue({ source: { kind: 'catchup' }, status: 'ready', strip: windowAround(items, 'abcdefghijk') })
})

const floatingControls = (over: Partial<FloatingVideoControls> = {}): FloatingVideoControls => ({
  supported: true,
  canOpen: true,
  isFloating: false,
  blocked: false,
  failed: false,
  open: vi.fn(),
  close: vi.fn(),
  registerSource: vi.fn(),
  ...over,
})

function renderPage(path = '/youtube/abcdefghijk?from=catchup', video: FloatingVideoControls = floatingControls()) {
  let nav: ReturnType<typeof useNavigate>
  const Grab = () => {
    nav = useNavigate()
    return null
  }
  const utils = render(
    <FloatingVideoContext.Provider value={video}>
      <MemoryRouter initialEntries={[path]}>
        <Grab />
        <Routes>
          <Route path="/youtube/:videoId" element={<YoutubePlayerPage />} />
        </Routes>
      </MemoryRouter>
    </FloatingVideoContext.Provider>,
  )
  return { ...utils, navigate: (to: string) => act(() => nav(to)) }
}


const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

const live = (over: Partial<VideoPageData> = {}) =>
  vi.mocked(useVideoPage).mockReturnValue({
    status: 'ready',
    data: data({ channelId: 'UC1', live: { state: 'live', viewerCount: 5, startedAt: null }, ...over }),
  })

const CASTING = { ...NO_CAST, connected: true, device: 'TV', now: { id: 'a', name: 'News One', state: 'playing' }, load: () => {}, start: () => {}, tune: () => {}, togglePause: () => {}, stop: () => {}, clearEnded: () => {} } satisfies CastApi

describe('YoutubePlayerPage while casting', () => {
  it.each([true, false])('says above the player that YouTube comes later (live: %s)', (isLive) => {
    if (isLive) live()
    render(
      <CastContext value={CASTING}>
        <MemoryRouter initialEntries={['/youtube/abcdefghijk']}>
          <Routes>
            <Route path="/youtube/:videoId" element={<YoutubePlayerPage />} />
          </Routes>
        </MemoryRouter>
      </CastContext>,
    )
    const line = screen.getByText('Casting YouTube is coming soon. Your TV keeps playing News One.')
    expect(before(line, screen.getByTestId('player'))).toBe(true)
    expect(line.closest('[data-testid="chat-dock"], .aspect-video')).toBeNull()
  })
})

describe('YoutubePlayerPage on a live video', () => {
  it('docks the chat beside the player, the player inside the dock, and drops the pop-out bar', () => {
    live()
    renderPage()
    const dock = screen.getByTestId('chat-dock')
    expect(dock).toHaveAttribute('data-kind', 'youtube')
    expect(dock).toHaveAttribute('data-channel', 'v:abcdefghijk@UC1')
    expect(within(dock).getByTestId('player')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
  })

  it('hides everything under the dock in fill mode, as the Twitch page does', () => {
    live()
    renderPage()
    expect(screen.getByRole('heading', { name: 'A title' }).closest('.fill-hide')).not.toBeNull()
  })

  it('puts the title above the dock', () => {
    live()
    renderPage()
    expect(before(screen.getByRole('heading', { name: 'A title' }), screen.getByTestId('chat-dock'))).toBe(true)
  })

  it('sends a bare video target when the channel is not known', () => {
    live({ channelId: '' })
    renderPage()
    expect(screen.getByTestId('chat-dock')).toHaveAttribute('data-channel', 'v:abcdefghijk')
  })

  it('has no dock for an ordinary or an upcoming video', () => {
    renderPage()
    expect(screen.queryByTestId('chat-dock')).not.toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pop out video' })).toBeInTheDocument()
  })

  it('has no dock for an upcoming video', () => {
    vi.mocked(useVideoPage).mockReturnValue({ status: 'ready', data: data({ live: { state: 'upcoming', viewerCount: null, startedAt: null } }) })
    renderPage()
    expect(screen.queryByTestId('chat-dock')).not.toBeInTheDocument()
  })

  it('does not start the player until it knows whether the video is live', () => {
    vi.mocked(useVideoPage).mockReturnValue({ data: null, status: 'loading' })
    renderPage()
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    expect(screen.getByText('Loading video...')).toBeInTheDocument()
  })

  it('stops waiting for details that never come: after 4 seconds the player starts', () => {
    vi.useFakeTimers()
    try {
      vi.mocked(useVideoPage).mockReturnValue({ data: null, status: 'loading' })
      renderPage()
      act(() => vi.advanceTimersByTime(3900))
      expect(screen.queryByTestId('player')).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(200))
      expect(screen.getByTestId('player')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('a live answer after the wait ran out does not move the player into a dock', () => {
    vi.useFakeTimers()
    try {
      vi.mocked(useVideoPage).mockReturnValue({ data: null, status: 'loading' })
      const { navigate } = renderPage()
      act(() => vi.advanceTimersByTime(4100))
      live()
      navigate('/youtube/abcdefghijk?from=catchup&x=1') // a re-render on the same video
      expect(screen.queryByTestId('chat-dock')).not.toBeInTheDocument()
      expect(screen.getByTestId('player')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts the player in the ordinary layout when the details cannot be had', () => {
    vi.mocked(useVideoPage).mockReturnValue({ data: null, status: 'unavailable' })
    renderPage()
    expect(screen.getByTestId('player')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-dock')).not.toBeInTheDocument()
  })

  it('puts a picked topic’s videos in the dock’s player slot', async () => {
    live()
    vi.mocked(searchTopic).mockResolvedValue([{ id: 'zzzzzzzzzzz', title: 'result card', channelTitle: 'c', thumbnail: '' }])
    renderPage()
    fireEvent.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Alpha' }))
    await waitFor(() => expect(within(screen.getByTestId('chat-dock')).getByRole('link', { name: /result card/ })).toBeInTheDocument())
  })

  it('leaves the floating video to the dock: the page draws no panel of its own', () => {
    live()
    renderPage('/youtube/abcdefghijk', floatingControls({ isFloating: true, canOpen: false }))
    expect(screen.getByTestId('chat-dock')).toBeInTheDocument()
    expect(screen.queryByTestId('floating-panel')).not.toBeInTheDocument()
  })
})
