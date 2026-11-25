import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useLayoutEffect, useState } from 'react'
import HlsPage from '../HlsPage'
import { useApp } from '../../contexts/AppContext'
import { CastContext, type CastApi } from '../../components/cast/castContext'
import { FloatingVideoContext, type FloatingVideoControls } from '../../components/chat/floatingVideoContext'
import { useStreamSnapshot } from '../../hooks/useStreamSnapshot'
import { NO_CAST, type CastView } from '../../lib/cast/castSender'
import { buildStreamPath } from '../../lib/routes'
import type { StreamEntry, StreamSnapshot } from '../../lib/streamsApi'

const started = vi.hoisted(() => [] as string[])
vi.mock('../../components/player/PlayerHost', () => ({
  default: ({ url }: { url: string }) => {
    started.push(url)
    return <div data-testid="player-host" data-url={url} />
  },
}))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => null }))
vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useStreamSnapshot', () => ({ useStreamSnapshot: vi.fn() }))
// Every card, not only those a real browser would have in view.
vi.mock('../../components/streams/StreamGrid', () => ({
  default: ({ streams, renderCard }: { streams: StreamEntry[]; renderCard: (s: StreamEntry, selected: boolean) => React.ReactNode }) => <div>{streams.map((s) => <div key={s.id}>{renderCard(s, false)}</div>)}</div>,
}))

const entry = (id: string, name: string, groups: number[] = [0]): StreamEntry => ({ id, name, groups, country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: `https://h.test/${id}.m3u8` })
const LIST: StreamSnapshot = { generated: '', defaultId: 'aaa', groups: ['News'], streams: [entry('aaa', 'Alpha'), entry('bbb', 'Beta')] }

const asked = { load: vi.fn(), start: vi.fn(), tune: vi.fn(), togglePause: vi.fn(), stop: vi.fn(), clearEnded: vi.fn() }
const closeFloat = vi.fn()

let setCast: (view: Partial<CastView>) => void
let go: ReturnType<typeof useNavigate>
let at: ReturnType<typeof useLocation>

function Spy() {
  const navigateNow = useNavigate()
  const locationNow = useLocation()
  useLayoutEffect(() => {
    go = navigateNow
    at = locationNow
  })
  return null
}

function Harness({ first, floating }: { first: Partial<CastView>; floating: boolean }) {
  const [view, setView] = useState<Partial<CastView>>(first)
  useLayoutEffect(() => {
    setCast = (next) => act(() => setView(next))
  }, [])
  const api: CastApi = { ...NO_CAST, ...view, ...asked }
  const video: FloatingVideoControls = { supported: true, canOpen: !floating, isFloating: floating, blocked: false, failed: false, open: vi.fn(), close: closeFloat, registerSource: vi.fn() }
  return (
    <CastContext value={api}>
      <FloatingVideoContext value={video}>
        <HlsPage />
      </FloatingVideoContext>
    </CastContext>
  )
}

function renderAt(path: string | { pathname: string; state?: unknown }, first: Partial<CastView> = { available: true }, floating = false) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Spy />
      <Routes>
        <Route path="hls-dash/:streamId?" element={<Harness first={first} floating={floating} />} />
        <Route path="twitch" element={<p>twitch</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const CONNECTED: Partial<CastView> = { available: true, connected: true, device: 'Living room', now: { id: 'bbb', name: 'Beta', state: 'playing' } }
const player = () => screen.queryByTestId('player-host')
const castButton = () => screen.queryByRole('button', { name: 'Cast to a TV' })
const card = (name: string) => screen.getByTitle(name)
const navigate = (...args: [string, { state?: unknown; replace?: boolean }?]) => act(() => void go(...args))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  started.length = 0
  vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'ready', snapshot: LIST })
  vi.mocked(useApp).mockReturnValue({ state: { player: { currentUrl: null, detection: null, debugMode: false } }, dispatch: vi.fn() } as unknown as ReturnType<typeof useApp>)
})

describe('the Cast button', () => {
  it('asks for Cast when the page opens, and shows only when a device is found', () => {
    renderAt('/hls-dash/aaa', {})
    expect(asked.load).toHaveBeenCalled()
    expect(castButton()).toBeNull()
    setCast({ available: true })
    expect(castButton()).not.toBeNull()
  })

  it('casts the page’s stream with the group the page shows', () => {
    renderAt('/hls-dash/aaa')
    fireEvent.click(screen.getByRole('button', { name: /^News/ }))
    fireEvent.click(castButton() as HTMLElement)
    expect(asked.start).toHaveBeenCalledWith(expect.objectContaining({ id: 'aaa', name: 'Alpha', url: 'https://h.test/aaa.m3u8', live: true }), 'News')
  })

  it('closes a floating video first', () => {
    renderAt('/hls-dash/aaa', { available: true }, true)
    fireEvent.click(castButton() as HTMLElement)
    expect(closeFloat).toHaveBeenCalled()
    expect(asked.start).toHaveBeenCalled()
  })

  it('is off, and says why, for what cannot be cast', () => {
    renderAt(buildStreamPath('https://h.test/a.mp4'))
    expect(castButton()).toBeDisabled()
    expect(castButton()).toHaveAttribute('title', 'Only HLS and DASH streams can be cast')
  })

  it('is there where the browser cannot float a video', () => {
    render(
      <CastContext value={{ ...NO_CAST, available: true, ...asked }}>
        <MemoryRouter initialEntries={['/hls-dash/aaa']}>
          <Routes>
            <Route path="hls-dash/:streamId?" element={<HlsPage />} />
          </Routes>
        </MemoryRouter>
      </CastContext>,
    )
    expect(castButton()).not.toBeNull()
  })
})

describe('while casting', () => {
  it('has a panel where the player was, saying what the TV is on', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    expect(player()).toBeNull()
    expect(castButton()).toBeNull()
    expect(screen.getByText('Playing on Living room')).toBeInTheDocument()
    expect(screen.getByTestId('cast-panel')).toHaveTextContent('Beta')
    expect(screen.queryByRole('button', { name: 'Pop out video' })).toBeNull()
  })

  it.each([
    ['tuning', 'Tuning…'],
    ['playing', 'Playing'],
    ['buffering', 'Buffering…'],
    ['paused', 'Paused'],
    ['failed', 'Not available'],
    ['ended', 'Finished'],
    ['idle', 'Nothing playing'],
  ] as const)('says %s as %s', (state, words) => {
    renderAt('/hls-dash/aaa', { ...CONNECTED, now: { id: 'bbb', name: 'Beta', state } })
    expect(screen.getByTestId('cast-state')).toHaveTextContent(words)
  })

  it('pauses, plays and stops', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    setCast({ ...CONNECTED, paused: true, now: { id: 'bbb', name: 'Beta', state: 'paused' } })
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(asked.togglePause).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Stop casting' }))
    expect(asked.stop).toHaveBeenCalledTimes(1)
  })

  it('follows the remote in the panel, not in the address', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    setCast({ ...CONNECTED, now: { id: 'aaa', name: 'Alpha', state: 'playing' } })
    expect(screen.getByTestId('cast-panel')).toHaveTextContent('Alpha')
    expect(at.pathname).toBe('/hls-dash/aaa')
    expect(asked.tune).not.toHaveBeenCalled()
  })
})

describe('what tunes the TV', () => {
  it('a card, once, and the address follows', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    fireEvent.click(card('Beta'))
    expect(asked.tune).toHaveBeenCalledTimes(1)
    expect(asked.tune).toHaveBeenCalledWith(expect.objectContaining({ id: 'bbb', name: 'Beta' }), null)
    expect(at.pathname).toBe('/hls-dash/bbb')
  })

  it('the card already in the address too: the remote may have moved the TV on', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    fireEvent.click(card('Alpha'))
    expect(asked.tune).toHaveBeenCalledTimes(1)
  })

  it('a pasted address, once, and the same one again', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    const path = buildStreamPath('https://p.test/x.m3u8')
    navigate(path, { state: { castPick: true } })
    expect(asked.tune).toHaveBeenCalledTimes(1)
    expect(asked.tune).toHaveBeenCalledWith(expect.objectContaining({ id: null, name: 'p.test', url: 'https://p.test/x.m3u8' }), null)
    setCast({ ...CONNECTED, now: { id: null, name: 'p.test', state: 'playing' } })
    expect(asked.tune).toHaveBeenCalledTimes(1)
    navigate(path, { state: { castPick: true } })
    expect(asked.tune).toHaveBeenCalledTimes(2)
  })

  it('not Back and Forward, a link to the page, or the list arriving', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    navigate(buildStreamPath('https://p.test/x.m3u8'), { state: { castPick: true } })
    asked.tune.mockClear()
    navigate('/hls-dash')
    act(() => void go(-1))
    act(() => void go(-1))
    act(() => void go(1))
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'ready', snapshot: { ...LIST } })
    setCast({ ...CONNECTED })
    expect(asked.tune).not.toHaveBeenCalled()
  })

  it('not a reload of a pasted address', () => {
    const path = buildStreamPath('https://p.test/x.m3u8')
    renderAt({ pathname: path, state: { castPick: true } }, CONNECTED)
    expect(asked.tune).not.toHaveBeenCalled()
  })

  it('not a paste made before casting, once casting starts', () => {
    renderAt('/hls-dash/aaa')
    navigate(buildStreamPath('https://p.test/x.m3u8'), { state: { castPick: true } })
    setCast(CONNECTED)
    expect(asked.tune).not.toHaveBeenCalled()
  })

  it('not a card while not casting', () => {
    renderAt('/hls-dash/aaa')
    fireEvent.click(card('Beta'))
    expect(asked.tune).not.toHaveBeenCalled()
    expect(player()).toHaveAttribute('data-url', 'https://h.test/bbb.m3u8')
  })

  it('not what cannot be cast', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    navigate(buildStreamPath('https://p.test/x.mp4'), { state: { castPick: true } })
    expect(asked.tune).not.toHaveBeenCalled()
  })
})

describe('when the cast ends', () => {
  it('by Stop here, plays the channel the TV was on, in place of the address', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    setCast({ available: true, stoppedOn: 'bbb' })
    expect(at.pathname).toBe('/hls-dash/bbb')
    expect(asked.clearEnded).toHaveBeenCalled()
    setCast({ available: true })
    expect(player()).toHaveAttribute('data-url', 'https://h.test/bbb.m3u8')
    act(() => void go(-1)) // replaced, not added: there is nothing to go back to
    expect(at.pathname).toBe('/hls-dash/bbb')
  })

  it('by Stop on a channel the list does not have, plays the page’s stream', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    setCast({ available: true, stoppedOn: 'zzz' })
    expect(at.pathname).toBe('/hls-dash/aaa')
    expect(player()).toHaveAttribute('data-url', 'https://h.test/aaa.m3u8')
  })

  it('never starts the old channel for a moment on the way to the TV’s', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    setCast({ available: true, stoppedOn: 'bbb' })
    expect(started).not.toContain('https://h.test/aaa.m3u8')
    expect(started).toContain('https://h.test/bbb.m3u8')
  })

  it('by itself, stays silent until Play here', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    setCast({ available: true, endedBySelf: true })
    expect(player()).toBeNull()
    expect(screen.getByText('Casting ended')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play here' }))
    expect(asked.clearEnded).toHaveBeenCalledTimes(1)
  })

  it('by itself, a card plays here', () => {
    renderAt('/hls-dash/aaa', CONNECTED)
    setCast({ available: true, endedBySelf: true })
    fireEvent.click(card('Beta'))
    expect(asked.clearEnded).toHaveBeenCalled()
  })

  it('by itself while on another page, does not greet a later visit', () => {
    renderAt('/hls-dash/aaa', { available: true, endedBySelf: true })
    expect(asked.clearEnded).toHaveBeenCalledTimes(1)
  })
})
