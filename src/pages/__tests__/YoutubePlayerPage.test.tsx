import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YoutubePlayerPage from '../YoutubePlayerPage'
import { useApp } from '../../contexts/AppContext'
import { useRelatedVideos } from '../../hooks/useRelatedVideos'
import { useVideoComments } from '../../hooks/useVideoComments'
import { useVideoContext } from '../../hooks/useVideoContext'
import { useVideoPage } from '../../hooks/useVideoPage'
import { getWatchedSeeds } from '../../lib/catchupStore'
import { windowAround } from '../../lib/videoContext'
import { searchTopic, type VideoPageData } from '../../lib/videoPageApi'

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
  vi.mocked(useRelatedVideos).mockReturnValue({ videos: [], status: 'empty' })
  vi.mocked(useVideoContext).mockReturnValue({ source: { kind: 'catchup' }, status: 'ready', strip: windowAround(items, 'abcdefghijk') })
})

function renderPage(path = '/youtube/abcdefghijk?from=catchup') {
  let nav: ReturnType<typeof useNavigate>
  const Grab = () => {
    nav = useNavigate()
    return null
  }
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Grab />
      <Routes>
        <Route path="/youtube/:videoId" element={<YoutubePlayerPage />} />
      </Routes>
    </MemoryRouter>,
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

  it('starts the next video with a clean screen: tags folded, description folded, no topic results from the last one', async () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`)
    vi.mocked(useVideoPage).mockReturnValue({ status: 'ready', data: data({ tags, topics: ['Topic one'], description: 'x'.repeat(600) }) })
    vi.mocked(searchTopic).mockResolvedValue([{ id: 'zzzzzzzzzzz', title: 'result card', channelTitle: 'c', thumbnail: '' }])
    const { navigate } = renderPage()
    fireEvent.click(screen.getByRole('button', { name: '+4 more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    fireEvent.click(screen.getByRole('button', { name: 'Topic one' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /result card/ })).toBeInTheDocument())
    navigate('/youtube/yyyyyyyyyyy')
    expect(screen.getByRole('button', { name: '+4 more' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /result card/ })).not.toBeInTheDocument()
  })
})
