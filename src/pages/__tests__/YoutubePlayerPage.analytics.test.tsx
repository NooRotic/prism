import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import YoutubePlayerPage from '../YoutubePlayerPage'
import { FloatingVideoContext, type FloatingVideoControls } from '../../components/chat/floatingVideoContext'
import { useApp } from '../../contexts/AppContext'
import { useRelatedVideos } from '../../hooks/useRelatedVideos'
import { useStayed } from '../../hooks/useStayed'
import { useVideoComments } from '../../hooks/useVideoComments'
import { useVideoContext } from '../../hooks/useVideoContext'
import { useVideoPage } from '../../hooks/useVideoPage'
import { trackEvent } from '../../lib/analytics'
import type { VideoPageData } from '../../lib/videoPageApi'

// What this page tells the owner's Matomo. The page's heavy parts are stubs, as in YoutubePlayerPage.test.tsx.
vi.mock('../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../lib/analytics')>()), trackEvent: vi.fn() }))
vi.mock('../../hooks/useStayed', () => ({ useStayed: vi.fn() }))
vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useVideoPage', () => ({ useVideoPage: vi.fn() }))
vi.mock('../../hooks/useVideoComments', () => ({ useVideoComments: vi.fn() }))
vi.mock('../../hooks/useVideoContext', () => ({ useVideoContext: vi.fn() }))
vi.mock('../../hooks/useRelatedVideos', () => ({ useRelatedVideos: vi.fn() }))
vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div /> }))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => <div /> }))

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
const details = (id: string, over: Partial<VideoPageData> = {}): VideoPageData => ({
  id, title: 'A title', channelTitle: `Channel ${id[0]}`, channelId: `UC${id[0]}`, thumbnail: '', publishedAt: '2020-01-01T00:00:00Z',
  viewCount: '10', description: '', tags: [], topics: [], live: { state: 'none', viewerCount: null, startedAt: null }, ...over,
})

/** The details each video has; one that is missing is still loading, null is unavailable. */
let known: Record<string, VideoPageData | null> = {}

const router: { go: (to: string) => void } = { go: () => {} }
function Nav() {
  const navigate = useNavigate()
  useEffect(() => {
    router.go = (to) => void navigate(to)
  }, [navigate])
  return null
}

const controls = (isFloating: boolean): FloatingVideoControls => ({
  supported: true, canOpen: true, isFloating, blocked: false, failed: false, open: vi.fn(), close: vi.fn(), registerSource: vi.fn(),
})
const tree = (isFloating = false) => (
  <FloatingVideoContext.Provider value={controls(isFloating)}>
    <MemoryRouter initialEntries={[`/youtube/${A}`]}>
      <Nav />
      <Routes>
        <Route path="/youtube/:videoId" element={<YoutubePlayerPage />} />
      </Routes>
    </MemoryRouter>
  </FloatingVideoContext.Provider>
)
const opened = () => vi.mocked(trackEvent).mock.calls
const lastStayed = () => vi.mocked(useStayed).mock.lastCall

beforeEach(() => {
  localStorage.clear()
  known = {}
  window.scrollTo = vi.fn()
  vi.mocked(trackEvent).mockClear()
  vi.mocked(useStayed).mockClear()
  vi.mocked(useApp).mockReturnValue({ state: { player: { currentUrl: null, detection: null } }, dispatch: vi.fn() } as never)
  vi.mocked(useVideoPage).mockImplementation((id) => {
    const data = known[id]
    if (data === undefined) return { data: null, status: 'loading' }
    return { data, status: data ? 'ready' : 'unavailable' }
  })
  vi.mocked(useVideoComments).mockReturnValue({ result: { status: 'disabled' } })
  vi.mocked(useRelatedVideos).mockReturnValue({ videos: [], status: 'empty' })
  vi.mocked(useVideoContext).mockReturnValue({ source: { kind: 'none' }, status: 'ready', strip: null } as never)
})

describe('YoutubePlayerPage: channels opened', () => {
  it('reports the channel when the details arrive, once, also when they are read again', () => {
    const { rerender } = render(tree())
    expect(opened()).toEqual([])

    known = { [A]: details(A) }
    rerender(tree())
    expect(opened()).toEqual([['YouTube', 'opened', 'Channel a (UCa)']])

    known = { [A]: details(A, { viewCount: '11' }) }
    rerender(tree())
    expect(opened()).toHaveLength(1)
  })

  it('reports each video moved to, also two of one channel', () => {
    known = { [A]: details(A), [B]: details(B, { channelTitle: 'Channel a', channelId: 'UCa' }) }
    render(tree())
    act(() => router.go(`/youtube/${B}`))

    expect(opened()).toEqual([['YouTube', 'opened', 'Channel a (UCa)'], ['YouTube', 'opened', 'Channel a (UCa)']])
  })

  it('reports only the second video when the first is left before its details arrive', () => {
    known = { [B]: details(B) }
    render(tree())
    act(() => router.go(`/youtube/${B}`))

    expect(opened()).toEqual([['YouTube', 'opened', 'Channel b (UCb)']])
  })

  it('gives the title alone when the channel id is unknown, and nothing when there are no details', () => {
    known = { [A]: details(A, { channelId: '' }) }
    render(tree())
    expect(opened()).toEqual([['YouTube', 'opened', 'Channel a']])

    vi.mocked(trackEvent).mockClear()
    known = { [A]: null }
    render(tree())
    expect(opened()).toEqual([])
    expect(lastStayed()).toEqual([null, false])
  })

  it('counts the stay under the channel, also with the video popped out', () => {
    known = { [A]: details(A) }
    const { rerender } = render(tree())
    expect(lastStayed()).toEqual(['Channel a (UCa)', false])

    rerender(tree(true))
    expect(lastStayed()).toEqual(['Channel a (UCa)', true])
  })
})
