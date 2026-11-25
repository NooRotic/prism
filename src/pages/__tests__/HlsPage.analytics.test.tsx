import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HlsPage from '../HlsPage'
import { useApp } from '../../contexts/AppContext'
import { useStreamSnapshot, type StreamSnapshotState } from '../../hooks/useStreamSnapshot'
import { trackEvent } from '../../lib/analytics'
import { resetFavoritesCache } from '../../lib/favorites'
import { resetFavoriteCounts } from '../../lib/favoritesApi'
import { buildStreamPath } from '../../lib/routes'
import type { StreamEntry, StreamSnapshot } from '../../lib/streamsApi'
import type { PlayerProps } from '../../types/player'

// What this page tells the owner's Matomo. The player is a stand-in whose buttons fire what a real one would.
vi.mock('../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../lib/analytics')>()), trackEvent: vi.fn() }))
vi.mock('../../components/player/PlayerHost', async () => {
  const { useState } = await import('react')
  return {
    default: function MockPlayerHost(props: PlayerProps & { renderError?: (error: string | null) => React.ReactNode }) {
      const [failed, setFailed] = useState(false)
      return (
        <div data-testid="player-host" data-url={props.url}>
          <button onClick={() => setFailed(true)}>fail</button>
          <button onClick={() => props.onPlaying?.()}>play</button>
          {failed && props.renderError?.('boom')}
        </div>
      )
    },
  }
})
vi.mock('../../components/player/StreamStatus', () => ({
  StreamErrorCard: (p: { onRetry: () => void; onTryAs: (kind: string) => void }) => (
    <div data-testid="error-card">
      <button onClick={p.onRetry}>retry</button>
      <button onClick={() => p.onTryAs('dash')}>try dash</button>
    </div>
  ),
  StreamStallNotice: () => null,
}))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => null }))
vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useStreamSnapshot', () => ({ useStreamSnapshot: vi.fn() }))

const entry = (over: Partial<StreamEntry> & { id: string; name: string }): StreamEntry => ({
  groups: [0], country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: `https://${over.id}.test/live.m3u8`, ...over,
})
const ALPHA = entry({ id: 'aaaaaaaaaaaa', name: 'Alpha One', pinned: true })
const BETA = entry({ id: 'bbbbbbbbbbbb', name: 'Beta Two' })
const SNAPSHOT: StreamSnapshot = { generated: '2026-11-14T05:00:00Z', defaultId: ALPHA.id, groups: ['Other'], streams: [ALPHA, BETA] }
const READY: StreamSnapshotState = { status: 'ready', snapshot: SNAPSHOT }
const LOADING: StreamSnapshotState = { status: 'loading', snapshot: null }
const DOWN: StreamSnapshotState = { status: 'unavailable', snapshot: null }

const SECRET = 'https://x.test/secret-key.m3u8'

const router: { go: (to: string) => void } = { go: () => {} }
function Nav() {
  const navigate = useNavigate()
  useEffect(() => {
    router.go = (to) => void navigate(to)
  }, [navigate])
  return null
}

const tree = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="hls-dash/:streamId?" element={<HlsPage />} />
    </Routes>
    <Nav />
  </MemoryRouter>
)

function renderAt(path: string, snapshot: StreamSnapshotState = READY) {
  vi.mocked(useStreamSnapshot).mockReturnValue(snapshot)
  return render(tree(path))
}

const events = (category: string) => vi.mocked(trackEvent).mock.calls.filter(([c]) => c === category).map(([, ...rest]) => rest)
const click = (name: string) => userEvent.setup().click(screen.getByRole('button', { name }))

beforeEach(() => {
  vi.mocked(trackEvent).mockClear()
  localStorage.clear()
  resetFavoritesCache()
  resetFavoriteCounts()
  vi.mocked(useApp).mockReturnValue({
    state: { player: { currentUrl: null, detection: null, debugMode: false } },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
})

afterEach(() => {
  cleanup()
})

describe('HlsPage: streams chosen', () => {
  it('reports a listed stream named in the address, once', () => {
    const { rerender } = renderAt(`/hls-dash/${BETA.id}`)
    rerender(tree(`/hls-dash/${BETA.id}`))

    expect(events('HLS / DASH')).toEqual([['chosen', 'Beta Two']])
  })

  it('reports each stream moved to', () => {
    renderAt(`/hls-dash/${BETA.id}`)
    act(() => router.go(`/hls-dash/${ALPHA.id}`))

    expect(events('HLS / DASH')).toEqual([['chosen', 'Beta Two'], ['chosen', 'Alpha One']])
  })

  it('reports a demo by its name, with the real list showing and with the server down', () => {
    renderAt('/hls-dash/bbb-hls')
    expect(events('HLS / DASH')).toEqual([['chosen', 'Big Buck Bunny']])

    cleanup()
    vi.mocked(trackEvent).mockClear()
    renderAt('/hls-dash/bbb-hls', DOWN)
    expect(events('HLS / DASH')).toEqual([['chosen', 'Big Buck Bunny']])
  })

  it('waits for the list before it names a listed stream', () => {
    const { rerender } = renderAt(`/hls-dash/${BETA.id}`, LOADING)
    expect(events('HLS / DASH')).toEqual([])

    vi.mocked(useStreamSnapshot).mockReturnValue(READY)
    rerender(tree(`/hls-dash/${BETA.id}`))
    expect(events('HLS / DASH')).toEqual([['chosen', 'Beta Two']])
  })

  it.each([
    ['the page opened on its default', '/hls-dash'],
    ['a pasted address', buildStreamPath(SECRET)],
    ['an id nobody knows', '/hls-dash/does-not-exist'],
  ])('reports no choice for %s', (_name, path) => {
    renderAt(path)

    expect(events('HLS / DASH')).toEqual([])
  })
})

describe('HlsPage: streams played and failed', () => {
  it('reports playing once, however often the player says so', async () => {
    renderAt(`/hls-dash/${BETA.id}`)
    await click('play')
    await click('play')

    expect(events('HLS / DASH')).toEqual([['chosen', 'Beta Two'], ['played', 'Beta Two']])
  })

  it('reports a failure once, also when a retry fails again', async () => {
    renderAt(`/hls-dash/${BETA.id}`)
    await click('fail')
    await click('retry')
    await click('fail')

    expect(events('HLS / DASH')).toEqual([['chosen', 'Beta Two'], ['failed', 'Beta Two']])
  })

  it('keeps the default stream apart', async () => {
    renderAt('/hls-dash')
    await click('play')

    expect(events('HLS / DASH')).toEqual([['default played', 'Alpha One']])
  })

  it('names the built-in default when the server is down', async () => {
    renderAt('/hls-dash', DOWN)
    await click('play')

    expect(events('HLS / DASH')).toEqual([['default played', 'Big Buck Bunny']])
  })

  it('never gives a pasted address', async () => {
    renderAt(buildStreamPath(SECRET))
    await click('play')
    await click('fail')

    expect(events('HLS / DASH')).toEqual([['played', 'Pasted address'], ['failed', 'Pasted address']])
    expect(JSON.stringify(vi.mocked(trackEvent).mock.calls)).not.toContain('x.test')
  })

  it('keeps the name of a listed stream tried as another type', async () => {
    renderAt(`/hls-dash/${BETA.id}`)
    await click('fail')
    await click('try dash')
    await click('play')

    expect(events('HLS / DASH')).toEqual([['chosen', 'Beta Two'], ['failed', 'Beta Two'], ['played', 'Beta Two']])
  })
})

describe('HlsPage: favorites', () => {
  it('reports a stream starred, by name, and nothing when it is un-starred', async () => {
    renderAt(`/hls-dash/${BETA.id}`)
    const list = screen.getByRole('region', { name: /stream list/i })
    const star = within(list).getAllByRole('button', { name: /Alpha One (to|from) favorites/ })[0]
    await userEvent.setup().click(star)
    expect(events('Feature')).toEqual([['favorite', 'Alpha One']])

    await userEvent.setup().click(within(list).getAllByRole('button', { name: /Alpha One (to|from) favorites/ })[0])
    expect(events('Feature')).toEqual([['favorite', 'Alpha One']])
  })
})
