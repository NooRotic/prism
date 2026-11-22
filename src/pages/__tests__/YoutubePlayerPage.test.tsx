import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YoutubePlayerPage from '../YoutubePlayerPage'
import { useApp } from '../../contexts/AppContext'
import { FloatingVideoContext } from '../../components/chat/floatingVideoContext'
import type { FloatingVideoControls } from '../../components/chat/floatingVideoContext'
import { useRelatedVideos } from '../../hooks/useRelatedVideos'
import { useVideoComments } from '../../hooks/useVideoComments'
import { useVideoContext } from '../../hooks/useVideoContext'
import { useVideoPage } from '../../hooks/useVideoPage'
import { getWatchedSeeds } from '../../lib/catchupStore'
import { windowAround } from '../../lib/videoContext'
import { searchTopic, type VideoPageData } from '../../lib/videoPageApi'
import { markQuotaReached, resetQuotaForTests } from '../../lib/youtubeQuota'

vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useVideoPage', () => ({ useVideoPage: vi.fn() }))
vi.mock('../../hooks/useVideoComments', () => ({ useVideoComments: vi.fn() }))
vi.mock('../../hooks/useVideoContext', () => ({ useVideoContext: vi.fn() }))
vi.mock('../../hooks/useRelatedVideos', () => ({ useRelatedVideos: vi.fn() }))
vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div data-testid="player" /> }))
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

/** The app after it has handled this page's PLAY_URL: it holds that video's address. */
const appHolds = (id: string) =>
  vi.mocked(useApp).mockReturnValue({
    state: { player: { currentUrl: `https://www.youtube.com/watch?v=${id}`, detection: { type: 'youtube' } } },
    dispatch: vi.fn(),
  } as never)

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

describe('YoutubePlayerPage', () => {
  it('lays out player, strip, title, tags, description, comments, related videos and topics in that order', () => {
    renderPage()
    const order = [
      screen.getByTestId('player'),
      screen.getByRole('navigation', { name: 'Playlist position' }),
      screen.getByRole('heading', { name: 'A title' }),
      screen.getByRole('group', { name: 'Tags' }),
      screen.getByRole('region', { name: 'Description' }),
      screen.getByRole('region', { name: 'Comments' }),
      screen.getByRole('region', { name: 'Related videos' }),
      screen.getByRole('region', { name: 'Related topics' }),
    ]
    for (let i = 0; i < order.length - 1; i++) expect(before(order[i], order[i + 1])).toBe(true)
  })

  it('does not hand the player a leftover Twitch address while it switches to this video', () => {
    // Coming from a Twitch channel page: the app still holds that channel as the current content on the first render.
    vi.mocked(useApp).mockReturnValue({
      state: { player: { currentUrl: 'https://www.twitch.tv/somechannel', detection: { type: 'twitch' } } },
      dispatch: vi.fn(),
    } as never)
    renderPage('/youtube/8uhD559zaLw')
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    expect(screen.getByText('Loading video...')).toBeInTheDocument()
  })

  it('asks the app to play this video, and shows the player once the app holds its address', () => {
    const dispatch = vi.fn()
    vi.mocked(useApp).mockReturnValue({
      state: { player: { currentUrl: 'https://www.twitch.tv/somechannel', detection: { type: 'twitch' } } },
      dispatch,
    } as never)
    const first = renderPage('/youtube/8uhD559zaLw')
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PLAY_URL', url: 'https://www.youtube.com/watch?v=8uhD559zaLw' }))
    first.unmount()
    vi.mocked(useApp).mockReturnValue({
      state: { player: { currentUrl: 'https://www.youtube.com/watch?v=8uhD559zaLw', detection: { type: 'youtube' } } },
      dispatch,
    } as never)
    renderPage('/youtube/8uhD559zaLw')
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('waits for the app to hold the next video address when moving from one video to another', () => {
    vi.mocked(useApp).mockReturnValue({
      state: { player: { currentUrl: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', detection: { type: 'youtube' } } },
      dispatch: vi.fn(),
    } as never)
    renderPage('/youtube/bbbbbbbbbbb')
    expect(screen.queryByTestId('player')).not.toBeInTheDocument()
  })

  it('says the details are not available, instead of leaving a gap, when the video cannot be described', () => {
    vi.mocked(useVideoPage).mockReturnValue({ data: null, status: 'unavailable' })
    renderPage()
    expect(screen.getByText("Details for this video aren't available.")).toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('keeps the gap, not that message, while the details are loading', () => {
    vi.mocked(useVideoPage).mockReturnValue({ data: null, status: 'loading' })
    renderPage()
    expect(screen.queryByText("Details for this video aren't available.")).not.toBeInTheDocument()
  })

  it('has no strip when the video has no context', () => {
    vi.mocked(useVideoContext).mockReturnValue({ source: null, status: 'none', strip: null })
    renderPage('/youtube/abcdefghijk')
    expect(screen.queryByRole('navigation', { name: 'Playlist position' })).not.toBeInTheDocument()
  })

  it('offers each topic once (tags and topics merged, case-insensitive), at most 12', () => {
    vi.mocked(useVideoPage).mockReturnValue({
      status: 'ready',
      data: data({ tags: ['Alpha', ...Array.from({ length: 20 }, (_, i) => `t${i}`)], topics: ['alpha', 'Gamma'] }),
    })
    renderPage()
    const region = screen.getByRole('region', { name: 'Related topics' })
    const buttons = region.querySelectorAll('button')
    expect(buttons.length).toBe(12)
    expect(Array.from(buttons).filter((b) => /^alpha$/i.test(b.textContent ?? ''))).toHaveLength(1)
  })

  it('records the video as watched, and records the next one and scrolls to the top when the route changes', () => {
    const { navigate } = renderPage()
    expect(getWatchedSeeds(5)).toEqual(['abcdefghijk'])
    navigate('/youtube/zzzzzzzzzzz')
    expect(getWatchedSeeds(5)).toEqual(['zzzzzzzzzzz', 'abcdefghijk'])
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0)
  })

  it('asks the hooks about the id in the address', () => {
    renderPage()
    expect(useVideoPage).toHaveBeenCalledWith('abcdefghijk')
    expect(useVideoContext).toHaveBeenCalledWith('abcdefghijk', '?from=catchup')
  })

  it('starts the next video with a clean screen: tags folded, description folded, the player back, no topic results from the last one', async () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`)
    vi.mocked(useVideoPage).mockReturnValue({ status: 'ready', data: data({ tags, topics: ['Topic one'], description: 'x'.repeat(600) }) })
    vi.mocked(searchTopic).mockResolvedValue([{ id: 'zzzzzzzzzzz', title: 'result card', channelTitle: 'c', thumbnail: '' }])
    const { navigate } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: '+4 more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Topic one' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /result card/ })).toBeInTheDocument())
    appHolds('yyyyyyyyyyy')
    navigate('/youtube/yyyyyyyyyyy')
    expect(screen.getByRole('button', { name: '+4 more' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /result card/ })).not.toBeInTheDocument()
    expect(screen.getByTestId('player')).toBeInTheDocument()
  })

  it('puts the related column beside the tags, under the title', () => {
    renderPage()
    const grid = screen.getByRole('group', { name: 'Tags' }).closest('.grid')
    expect(grid).not.toBeNull()
    expect(within(grid as HTMLElement).getByRole('region', { name: 'Related videos' })).toBeInTheDocument()
    expect(within(grid as HTMLElement).getByRole('region', { name: 'Comments' })).toBeInTheDocument()
  })

  describe('opening a tag or topic', () => {
    const hit = { id: 'zzzzzzzzzzz', title: 'result card', channelTitle: 'c', thumbnail: '' }
    beforeEach(() => {
      vi.mocked(searchTopic).mockReset()
      vi.mocked(searchTopic).mockResolvedValue([hit])
    })

    it('a tag replaces the player with that topic videos and a Replay video bar returns it', async () => {
      renderPage()
      fireEvent.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Alpha' }))
      await waitFor(() => expect(screen.getByRole('link', { name: /result card/ })).toHaveAttribute('href', '/youtube/zzzzzzzzzzz'))
      expect(screen.queryByTestId('player')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Videos for Alpha' })).toBeInTheDocument()
      expect(searchTopic).toHaveBeenCalledWith('Alpha')
      fireEvent.click(screen.getByRole('button', { name: 'Replay video' }))
      expect(screen.getByTestId('player')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /result card/ })).not.toBeInTheDocument()
    })

    it('a button in Related topics does the same', async () => {
      renderPage()
      fireEvent.click(within(screen.getByRole('region', { name: 'Related topics' })).getByRole('button', { name: 'Gamma' }))
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Videos for Gamma' })).toBeInTheDocument())
      expect(screen.queryByTestId('player')).not.toBeInTheDocument()
    })

    it('hides the pop-out bar while the topic videos are shown', async () => {
      renderPage()
      fireEvent.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Alpha' }))
      await waitFor(() => expect(screen.getByRole('link', { name: /result card/ })).toBeInTheDocument())
      expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
    })

    it('moving to another video shows its player again', async () => {
      const { navigate } = renderPage()
      fireEvent.click(within(screen.getByRole('group', { name: 'Tags' })).getByRole('button', { name: 'Alpha' }))
      await waitFor(() => expect(screen.getByRole('link', { name: /result card/ })).toBeInTheDocument())
      appHolds('yyyyyyyyyyy')
      navigate('/youtube/yyyyyyyyyyy')
      expect(screen.getByTestId('player')).toBeInTheDocument()
    })
  })

  describe('pop-out', () => {
    it('tells the floating window which video it shows, follows the route, and withdraws on leaving', () => {
      const video = floatingControls()
      const { navigate, unmount } = renderPage('/youtube/abcdefghijk', video)
      expect(video.registerSource).toHaveBeenLastCalledWith({ kind: 'youtube', videoId: 'abcdefghijk' })
      navigate('/youtube/zzzzzzzzzzz')
      expect(video.registerSource).toHaveBeenLastCalledWith({ kind: 'youtube', videoId: 'zzzzzzzzzzz' })
      unmount()
      expect(video.registerSource).toHaveBeenLastCalledWith(null)
    })

    it('opens the window from where the video is playing', () => {
      const video = floatingControls()
      renderPage('/youtube/abcdefghijk', video)
      const element = document.createElement('youtube-video')
      Object.defineProperty(element, 'currentTime', { value: 61.5 })
      document.body.appendChild(element)
      fireEvent.click(screen.getByRole('button', { name: 'Pop out video' }))
      element.remove()
      expect(video.open).toHaveBeenCalledWith({ startSec: 61.5 })
    })

    it('has no button where the browser cannot float a video', () => {
      renderPage('/youtube/abcdefghijk', floatingControls({ supported: false, canOpen: false }))
      expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
    })

    it('takes the player out of the page while the window plays, so nothing plays twice', () => {
      renderPage('/youtube/abcdefghijk', floatingControls({ isFloating: true, canOpen: false }))
      expect(screen.queryByTestId('player')).not.toBeInTheDocument()
      expect(screen.getByTestId('floating-panel')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'A title' })).toBeInTheDocument()
    })
  })

  describe('when the Mix has no related videos', () => {
    const hit = { id: 'zzzzzzzzzzz', title: 'topic result', channelTitle: 'c', thumbnail: '' }
    beforeEach(() => {
      vi.mocked(searchTopic).mockReset()
      vi.mocked(searchTopic).mockResolvedValue([hit])
      vi.mocked(useRelatedVideos).mockReturnValue({ videos: [], status: 'empty' })
    })

    it('offers the first topic as a button and runs no search until it is clicked', async () => {
      renderPage()
      const region = screen.getByRole('region', { name: 'Related videos' })
      expect(within(region).getByText('No related videos found.')).toBeInTheDocument()
      expect(searchTopic).not.toHaveBeenCalled()
      fireEvent.click(within(region).getByRole('button', { name: 'Find videos for alpha' }))
      expect(within(region).getByRole('heading', { name: 'Related videos to alpha' })).toBeInTheDocument()
      await waitFor(() => expect(within(region).getByRole('link', { name: /topic result/ })).toBeInTheDocument())
      expect(searchTopic).toHaveBeenCalledTimes(1)
      expect(searchTopic).toHaveBeenCalledWith('alpha')
    })

    it('with one topic, still shows the one topic button below the comments as before', () => {
      vi.mocked(useVideoPage).mockReturnValue({ status: 'ready', data: data({ tags: [], topics: ['Only one'] }) })
      renderPage()
      expect(screen.getByRole('button', { name: 'Find videos for Only one' })).toBeInTheDocument()
      const topics = screen.getByRole('region', { name: 'Related topics' })
      expect(within(topics).getAllByRole('button')).toHaveLength(1)
      expect(searchTopic).not.toHaveBeenCalled()
    })

    it('offers the button again after moving to another video', async () => {
      const { navigate } = renderPage()
      fireEvent.click(screen.getByRole('button', { name: 'Find videos for alpha' }))
      await waitFor(() => expect(searchTopic).toHaveBeenCalledTimes(1))
      await navigate('/youtube/bbbbbbbbbbb')
      expect(screen.getByRole('button', { name: 'Find videos for alpha' })).toBeInTheDocument()
      expect(searchTopic).toHaveBeenCalledTimes(1)
    })

    it('says nothing found when the topic search finds nothing', async () => {
      vi.mocked(searchTopic).mockResolvedValue([])
      renderPage()
      const region = screen.getByRole('region', { name: 'Related videos' })
      fireEvent.click(within(region).getByRole('button', { name: 'Find videos for alpha' }))
      await waitFor(() => expect(within(region).getByText('Nothing found')).toBeInTheDocument())
    })

    it('keeps the plain message when the video has no topics', () => {
      vi.mocked(useVideoPage).mockReturnValue({ status: 'ready', data: data({ tags: [], topics: [] }) })
      renderPage()
      expect(screen.getByText('No related videos found.')).toBeInTheDocument()
      expect(searchTopic).not.toHaveBeenCalled()
    })

    it('does not search while the Mix is still loading, or when it found videos', () => {
      vi.mocked(useRelatedVideos).mockReturnValue({ videos: [], status: 'loading' })
      const { unmount } = renderPage()
      expect(searchTopic).not.toHaveBeenCalled()
      unmount()
      vi.mocked(useRelatedVideos).mockReturnValue({ videos: [{ id: 'rrrrrrrrrrr', title: 'rel', channel: 'c', publishedAt: '', durationSec: 60, thumbnail: '' }], status: 'ready' })
      renderPage()
      expect(screen.getByRole('heading', { name: 'Related videos' })).toBeInTheDocument()
      expect(searchTopic).not.toHaveBeenCalled()
    })
  })

  describe('when the YouTube daily limit is used up', () => {
    beforeEach(() => resetQuotaForTests())

    it('shows no notice while there is quota', () => {
      renderPage()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })

    it('says so, and that the video still plays, once a call is refused for quota', () => {
      renderPage()
      act(() => markQuotaReached())
      expect(screen.getByRole('status')).toHaveTextContent(/daily limit/)
      expect(screen.getByRole('status')).toHaveTextContent(/video itself still plays/)
      expect(screen.getByTestId('player')).toBeInTheDocument()
    })
  })
})
