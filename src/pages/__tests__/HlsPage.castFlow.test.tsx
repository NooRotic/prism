// Casting from the HLS / DASH page with everything real but Google's SDK: the sender, the provider, the page and the browser's
// router (which, unlike the one in memory, applies a navigation after a store update).
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import HlsPage from '../HlsPage'
import { useApp } from '../../contexts/AppContext'
import CastProvider from '../../components/cast/CastProvider'
import { FloatingVideoContext, type FloatingVideoControls } from '../../components/chat/floatingVideoContext'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useStreamSnapshot } from '../../hooks/useStreamSnapshot'
import { trackEvent } from '../../lib/analytics'
import { createCastSender } from '../../lib/cast/castSender'
import { installFakeCast, type FakeCast } from '../../lib/cast/__tests__/fakeCast'
import { resetFavoritesCache } from '../../lib/favorites'
import { buildStreamPath } from '../../lib/routes'
import type { StreamEntry, StreamSnapshot } from '../../lib/streamsApi'

const played = vi.hoisted(() => [] as string[])
vi.mock('../../components/player/PlayerHost', () => ({
  default: function Player({ url }: { url: string }) {
    useEffect(() => {
      played.push(url)
    }, [url])
    return <div data-testid="player-host" data-url={url} />
  },
}))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => null }))
vi.mock('../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../lib/analytics')>()), trackEvent: vi.fn() }))
vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useStreamSnapshot', () => ({ useStreamSnapshot: vi.fn() }))
vi.mock('../../components/streams/StreamGrid', () => ({
  default: ({ streams, renderCard }: { streams: StreamEntry[]; renderCard: (s: StreamEntry, selected: boolean) => React.ReactNode }) => <div>{streams.map((s) => <div key={s.id}>{renderCard(s, false)}</div>)}</div>,
}))

const entry = (id: string, name: string): StreamEntry => ({ id, name, groups: [0], country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: `https://h.test/${id}.m3u8` })
const LIST: StreamSnapshot = { generated: '', defaultId: 'aaa', groups: ['News'], streams: [entry('aaa', 'Alpha'), entry('bbb', 'Beta'), entry('ccc', 'Gamma')] }
const URL_A = 'https://h.test/aaa.m3u8'
const URL_B = 'https://h.test/bbb.m3u8'

let fake: FakeCast
const registerSource = vi.fn()
const closeFloat = vi.fn()

function mount(path: string, { floating = false, sender = createCastSender() } = {}) {
  window.history.replaceState(null, '', path)
  const video: FloatingVideoControls = { supported: true, canOpen: !floating, isFloating: floating, blocked: false, failed: false, open: vi.fn(), close: closeFloat, registerSource }
  return render(
    <BrowserRouter>
      <CastProvider sender={sender}>
        <FloatingVideoContext value={video}>
          <Link to="/twitch">to twitch</Link>
          <Link to="/hls-dash/aaa">to alpha</Link>
          <Link to={buildStreamPath('https://p.test/x.mp4')} state={{ castPick: true }}>
            paste mp4
          </Link>
          <Link to={buildStreamPath('https://p.test/x.m3u8')} state={{ castPick: true }}>
            paste hls
          </Link>
          <Routes>
            <Route path="hls-dash/:streamId?" element={<HlsPage />} />
            <Route path="twitch" element={<p>twitch</p>} />
          </Routes>
        </FloatingVideoContext>
      </CastProvider>
    </BrowserRouter>,
  )
}

const ready = () =>
  act(() => {
    fake.sdkReady()
    fake.castState('NOT_CONNECTED')
  })
const castButton = () => screen.getByRole('button', { name: 'Cast to a TV' })
const click = (element: HTMLElement) => act(async () => void fireEvent.click(element))
const card = (name: string) => screen.getByTitle(name)
const player = () => screen.queryByTestId('player-host')
const tell = (id: string, name: string, state = 'playing') => act(() => fake.message({ v: 1, type: 'now', id, name, state }))
const loaded = () => fake.loadMedia.mock.calls.map(([request]) => request.media.contentId)
const pastedOnTv = () => fake.message({ v: 1, type: 'now', id: null, name: 'p.test', state: 'tuning' })
const where = () => window.location.pathname + window.location.search

async function casting(path = '/hls-dash/aaa') {
  const utils = mount(path)
  ready()
  await click(castButton())
  act(() => fake.sessionStarted('Living room'))
  await act(async () => {})
  return utils
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetFavoritesCache()
  document.head.innerHTML = ''
  vi.clearAllMocks()
  played.length = 0
  fake = installFakeCast()
  vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'ready', snapshot: LIST })
  vi.mocked(useApp).mockReturnValue({ state: { player: { currentUrl: null, detection: null, debugMode: false } }, dispatch: vi.fn() } as unknown as ReturnType<typeof useApp>)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('starting', () => {
  it('takes the stream to the TV and the player off the page', async () => {
    await casting()
    expect(loaded()).toEqual(['aaa'])
    expect(player()).toBeNull()
  })

  it('a second press on Cast does not lose the stream', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await click(castButton())
    expect(fake.requestSession).toHaveBeenCalledTimes(1)
    act(() => fake.sessionStarted('Living room'))
    expect(loaded()).toEqual(['aaa'])
  })

  it('a closed picker leaves everything as it was, and Cast works again', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await act(async () => fake.cancelPicker())
    expect(player()).toHaveAttribute('data-url', URL_A)
    await click(castButton())
    expect(fake.requestSession).toHaveBeenCalledTimes(2)
  })

  it('a card picked while it is connecting is the one that is cast', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await click(card('Beta'))
    act(() => fake.sessionStarted('Living room'))
    expect(loaded()).toEqual(['bbb'])
  })

  it('from Chrome’s own Cast menu takes the page’s stream, and closes a floating video', async () => {
    mount('/hls-dash/bbb', { floating: true })
    ready()
    act(() => fake.sessionStarted('Living room'))
    expect(loaded()).toEqual(['bbb'])
    expect(closeFloat).toHaveBeenCalled()
  })

  it('so is an address pasted while it is connecting', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await click(screen.getByText('paste hls'))
    act(() => fake.sessionStarted('Living room'))
    expect(fake.loadMedia.mock.calls.map(([request]) => request.media.contentUrl)).toEqual(['https://p.test/x.m3u8'])
  })

  it('from Chrome’s own Cast menu takes the channel the page is on by then', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(card('Beta'))
    act(() => fake.sessionStarted('Living room'))
    expect(loaded()).toEqual(['bbb'])
  })

  it('from Chrome’s own Cast menu on a stream that cannot be cast sends nothing, and says why', async () => {
    mount(buildStreamPath('https://p.test/x.mp4'))
    ready()
    act(() => fake.sessionStarted('Living room'))
    expect(loaded()).toEqual([])
    expect(screen.getByTestId('cast-panel')).toHaveTextContent('Only HLS and DASH streams can be cast')
  })

  it('a phone pressing Cast while the TV plays sees the TV’s channel and changes nothing', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    act(() => fake.sessionStarted('Living room', { state: 'playing', id: 'bbb', name: 'Beta' }))
    await act(async () => {})
    expect(loaded()).toEqual([])
    expect(screen.getByTestId('cast-panel')).toHaveTextContent('Beta')
  })

  it('from Chrome’s own Cast menu on another page waits for a choice', async () => {
    mount('/hls-dash/bbb')
    ready()
    await click(screen.getByText('to twitch'))
    act(() => fake.sessionStarted('Living room'))
    expect(loaded()).toEqual([])
  })
})

describe('a reload while casting', () => {
  it('makes no sound on the computer until it is known whether the TV is still there', () => {
    vi.useFakeTimers()
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    expect(player()).toBeNull()
    expect(screen.getByText('Reconnecting to the TV…')).toBeInTheDocument()
    ready()
    expect(player()).toBeNull()
    act(() => fake.sessionResumed('Living room'))
    expect(screen.getByText('Playing on Living room')).toBeInTheDocument()
    expect(played).toEqual([])
  })

  it('plays here after 5 s when the TV is not there any more, and forgets it', () => {
    vi.useFakeTimers()
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    act(() => vi.advanceTimersByTime(4_999))
    expect(player()).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(player()).toHaveAttribute('data-url', URL_A)
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_CASTING)).toBeNull()
  })

  it('a card picked before the TV is back is what it plays', async () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    await click(card('Beta'))
    expect(player()).toBeNull()
    act(() => fake.sessionResumed('Living room'))
    expect(loaded()).toEqual(['bbb'])
  })

  it('so is an address pasted before the TV is back', async () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    await click(screen.getByText('paste hls'))
    act(() => fake.sessionResumed('Living room'))
    expect(loaded()).toEqual(['pasted'])
  })

  it('never tunes the TV by itself, whatever Google calls the rejoin', () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionStarted('Living room'))
    expect(screen.getByText('Playing on Living room')).toBeInTheDocument()
    expect(loaded()).toEqual([])
  })

  it('is remembered for the next reload too, and over once the cast ends', async () => {
    vi.useFakeTimers()
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionResumed('Living room'))
    act(() => vi.advanceTimersByTime(5_000))
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_CASTING)).toBe('1')
    act(() => fake.sessionEnded())
    expect(screen.getByText('Casting ended')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Play here' }))
    expect(player()).toHaveAttribute('data-url', URL_A)
  })

  it('plays here at once when Google’s script says there is no Cast', () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    act(() => (window as unknown as { __onGCastApiAvailable(ok: boolean): void }).__onGCastApiAvailable(false))
    expect(player()).toHaveAttribute('data-url', URL_A)
  })

  it('plays here at once when Google’s script is blocked', () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    act(() => void document.querySelector('script[src*="cast_sender"]')?.dispatchEvent(new Event('error')))
    expect(player()).toHaveAttribute('data-url', URL_A)
  })
})

describe('Stop casting', () => {
  it('plays the channel the TV was on, and never the old one on the way', async () => {
    await casting()
    tell('bbb', 'Beta')
    played.length = 0
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await act(async () => fake.sessionEnded())
    expect(window.location.pathname).toBe('/hls-dash/bbb')
    expect(played).toEqual([URL_B])
  })

  it('on the page’s own channel plays it', async () => {
    await casting()
    tell('aaa', 'Alpha')
    played.length = 0
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await act(async () => fake.sessionEnded())
    expect(played).toEqual([URL_A])
  })

  it.each([
    ['the page’s own card', 'Alpha', '/hls-dash/aaa', URL_A],
    ['another card', 'Gamma', '/hls-dash/ccc', 'https://h.test/ccc.m3u8'],
  ])('%s picked before the TV has let go is what plays here', async (_what, name, path, url) => {
    await casting()
    tell('bbb', 'Beta')
    played.length = 0
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await click(card(name))
    await act(async () => fake.sessionEnded())
    expect(loaded()).toEqual(['aaa'])
    expect(window.location.pathname).toBe(path)
    expect(played).toEqual([url])
  })

  it('an address pasted before the TV has let go is what plays here', async () => {
    await casting()
    tell('bbb', 'Beta')
    played.length = 0
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await click(screen.getByText('paste hls'))
    await act(async () => fake.sessionEnded())
    expect(played).toEqual(['https://p.test/x.m3u8'])
  })

  it('plays the page’s own stream when that is what could not be cast, and keeps its address', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await click(screen.getByText('paste mp4'))
    played.length = 0
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await act(async () => fake.sessionEnded())
    expect(played).toEqual(['https://p.test/x.mp4'])
    expect(window.location.pathname + window.location.search).toBe(buildStreamPath('https://p.test/x.mp4'))
  })

  it('before the list has come waits for it, then plays the channel the TV was on', async () => {
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'loading', snapshot: null } as unknown as ReturnType<typeof useStreamSnapshot>)
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionResumed('Living room'))
    tell('bbb', 'Beta')
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await act(async () => fake.sessionEnded())
    expect(played).toEqual([])
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'ready', snapshot: LIST })
    await act(async () => fake.castState('NO_DEVICES_AVAILABLE')) // the page looks again
    expect(window.location.pathname).toBe('/hls-dash/bbb')
    expect(played).toEqual([URL_B])
  })

  it('does not wait for a list that never comes', async () => {
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'loading', snapshot: null } as unknown as ReturnType<typeof useStreamSnapshot>)
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount(buildStreamPath('https://p.test/x.m3u8'))
    ready()
    act(() => fake.sessionResumed('Living room'))
    tell('bbb', 'Beta')
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await act(async () => fake.sessionEnded())
    expect(played).toEqual([])
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'unavailable', snapshot: null } as unknown as ReturnType<typeof useStreamSnapshot>)
    await act(async () => fake.castState('NO_DEVICES_AVAILABLE'))
    expect(played).toEqual(['https://p.test/x.m3u8'])
  })

  it('does not take over a later visit', async () => {
    await casting()
    tell('bbb', 'Beta')
    await click(screen.getByRole('button', { name: 'Stop casting' }))
    await click(screen.getByText('to twitch'))
    await act(async () => fake.sessionEnded())
    await click(screen.getByText('to alpha'))
    expect(window.location.pathname).toBe('/hls-dash/aaa')
    expect(player()).toHaveAttribute('data-url', URL_A)
  })
})

describe('a cast that ends by itself', () => {
  it('leaves the computer silent: no player, and nothing for a floating window to play', async () => {
    await casting()
    played.length = 0
    registerSource.mockClear()
    await act(async () => fake.sessionEnded())
    expect(screen.getByText('Casting ended')).toBeInTheDocument()
    expect(played).toEqual([])
    expect(registerSource.mock.calls.every(([source]) => source === null)).toBe(true)
    expect(screen.queryByRole('button', { name: 'Pop out video' })).toBeNull()
    expect(castButton()).toBeInTheDocument()
    await click(screen.getByRole('button', { name: 'Play here' }))
    expect(player()).toHaveAttribute('data-url', URL_A)
    expect(registerSource).toHaveBeenLastCalledWith(expect.objectContaining({ url: URL_A }))
  })

  it('a card picked then is all that plays, never the old channel on the way', async () => {
    await casting()
    played.length = 0
    await act(async () => fake.sessionEnded())
    await click(card('Beta'))
    expect(played).toEqual([URL_B])
  })

  it('the card of the channel that was on plays it', async () => {
    await casting()
    played.length = 0
    await act(async () => fake.sessionEnded())
    await click(card('Alpha'))
    expect(played).toEqual([URL_A])
  })

  it('while on another page, a later visit plays as usual', async () => {
    await casting()
    await click(screen.getByText('to twitch'))
    await act(async () => fake.sessionEnded())
    await click(screen.getByText('to alpha'))
    expect(screen.queryByText('Casting ended')).toBeNull()
    expect(player()).toHaveAttribute('data-url', URL_A)
  })

  it('long after a Stop that never worked is not taken for that Stop', async () => {
    await casting()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('button', { name: 'Stop casting' }))
    act(() => vi.advanceTimersByTime(10_000))
    played.length = 0
    act(() => fake.sessionEnded())
    expect(screen.getByText('Casting ended')).toBeInTheDocument()
    expect(played).toEqual([])
  })
})

describe('following the TV', () => {
  it('a remote flip takes the page to that channel, in place, without tuning anything', async () => {
    await casting()
    tell('aaa', 'Alpha')
    const entries = window.history.length
    await act(async () => tell('bbb', 'Beta', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
    expect(window.history.length).toBe(entries)
    expect(loaded()).toEqual(['aaa'])
    expect(screen.getByTestId('cast-panel')).toHaveTextContent('Beta')
  })

  it('a phone that joins shows the channel the TV is on', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await act(async () => fake.sessionStarted('Living room', { state: 'playing', id: 'ccc', name: 'Gamma' }))
    expect(window.location.pathname).toBe('/hls-dash/ccc')
    expect(loaded()).toEqual([])
  })

  it('a reload finds the TV again on the channel it is on', async () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionResumed('Living room'))
    await act(async () => tell('bbb', 'Beta'))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
    expect(loaded()).toEqual([])
  })

  it('a second cast in the same visit follows the TV again', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await act(async () => fake.sessionStarted('Living room'))
    await act(async () => fake.sessionEnded())
    await click(castButton())
    await act(async () => fake.sessionStarted('Living room', { state: 'playing', id: 'ccc', name: 'Gamma' }))
    expect(window.location.pathname).toBe('/hls-dash/ccc')
  })

  it('a word from the TV before the list has come is kept until it does', async () => {
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'loading', snapshot: null } as unknown as ReturnType<typeof useStreamSnapshot>)
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionResumed('Living room'))
    await act(async () => tell('bbb', 'Beta'))
    expect(window.location.pathname).toBe('/hls-dash/aaa')
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'ready', snapshot: LIST })
    await act(async () => fake.castState('NO_DEVICES_AVAILABLE')) // the page looks again
    expect(window.location.pathname).toBe('/hls-dash/bbb')
  })

  it('a card picked while the TV still tunes the last flip stays picked', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await act(async () => tell('bbb', 'Beta', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
    await click(card('Gamma'))
    expect(loaded()).toEqual(['aaa', 'ccc'])
    expect(window.location.pathname).toBe('/hls-dash/ccc')
    await act(async () => tell('ccc', 'Gamma', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/ccc')
  })

  it('an address pasted while the TV still tunes the last flip stays on the page', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await act(async () => tell('bbb', 'Beta', 'tuning'))
    await click(screen.getByText('paste hls'))
    expect(loaded()).toEqual(['aaa', 'pasted'])
    await act(async () => pastedOnTv())
    expect(where()).toBe(buildStreamPath('https://p.test/x.m3u8'))
  })

  it('an address pasted while connecting to a TV that plays stays on the page', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await click(screen.getByText('paste hls'))
    await act(async () => fake.sessionStarted('Living room', { state: 'playing', id: 'ccc', name: 'Gamma' }))
    expect(loaded()).toEqual(['pasted'])
    await act(async () => pastedOnTv())
    expect(where()).toBe(buildStreamPath('https://p.test/x.m3u8'))
  })

  it('an address pasted on another page while casting stays on the page it opens', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await click(screen.getByText('to twitch'))
    tell('ccc', 'Gamma', 'tuning')
    tell('ccc', 'Gamma', 'playing')
    await click(screen.getByText('paste hls'))
    expect(loaded()).toEqual(['aaa', 'pasted'])
    await act(async () => pastedOnTv())
    expect(where()).toBe(buildStreamPath('https://p.test/x.m3u8'))
  })

  it('a phone joining a TV whose channel failed keeps its own, which the TV is told to play', async () => {
    mount('/hls-dash/aaa')
    ready()
    await click(castButton())
    await act(async () => fake.sessionStarted('Living room', { state: 'failed', id: 'ccc', name: 'Gamma' }))
    expect(loaded()).toEqual(['aaa'])
    expect(window.location.pathname).toBe('/hls-dash/aaa')
  })

  it('a reload follows the TV whatever it is doing, even a channel that failed', async () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionResumed('Living room'))
    await act(async () => tell('ccc', 'Gamma', 'failed'))
    expect(window.location.pathname).toBe('/hls-dash/ccc')
  })

  it('a channel the page follows is not counted as one somebody chose', async () => {
    await casting()
    tell('aaa', 'Alpha')
    vi.mocked(trackEvent).mockClear()
    await act(async () => tell('bbb', 'Beta', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
    expect(vi.mocked(trackEvent).mock.calls.filter(([, action]) => action === 'chosen')).toEqual([])
  })

  it('never reads an old word again when the page moves for another reason', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await act(async () => tell('bbb', 'Beta', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
    await click(screen.getByText('to alpha')) // a link, not a pick: nothing goes to the TV
    expect(window.location.pathname).toBe('/hls-dash/aaa')
    expect(loaded()).toEqual(['aaa'])
  })

  it('follows the remote again as soon as the TV has the pick made here', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await click(card('Gamma'))
    await act(async () => tell('ccc', 'Gamma', 'tuning'))
    await act(async () => tell('bbb', 'Beta', 'tuning')) // then the remote
    expect(window.location.pathname).toBe('/hls-dash/bbb')
  })

  it('follows again after 10 s when the TV never takes the pick', async () => {
    vi.useFakeTimers()
    await casting()
    tell('aaa', 'Alpha')
    await click(card('Gamma'))
    act(() => vi.advanceTimersByTime(9_000))
    await act(async () => tell('bbb', 'Beta', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/ccc')
    act(() => vi.advanceTimersByTime(1_000))
    await act(async () => tell('aaa', 'Alpha', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/aaa')
  })

  it('a flip right after the hold has run out is followed', async () => {
    vi.useFakeTimers()
    await casting()
    tell('aaa', 'Alpha')
    await click(card('Gamma'))
    act(() => vi.advanceTimersByTime(10_000))
    await act(async () => tell('bbb', 'Beta', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
  })

  it('a pick does not outlive the cast it was made in', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await click(card('Gamma')) // the TV never names it
    await act(async () => fake.sessionEnded())
    await click(castButton())
    await act(async () => fake.sessionStarted('Living room', { state: 'playing', id: 'bbb', name: 'Beta' }))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
  })

  it('a late word about the old channel does not undo a card picked here', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await click(card('Beta'))
    expect(loaded()).toEqual(['aaa', 'bbb'])
    await act(async () => tell('aaa', 'Alpha'))
    expect(window.location.pathname).toBe('/hls-dash/bbb')
  })

  it('stays put for a channel the list does not have, or a pasted address', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await act(async () => tell('zzz', 'Unknown', 'tuning'))
    expect(window.location.pathname).toBe('/hls-dash/aaa')
    await act(async () => fake.message({ v: 1, type: 'now', id: null, name: 'p.test', state: 'tuning' }))
    expect(window.location.pathname).toBe('/hls-dash/aaa')
  })
})

describe('the controls', () => {
  it('are there although the page’s own stream cannot be found', async () => {
    vi.mocked(useStreamSnapshot).mockReturnValue({ status: 'unavailable', snapshot: null } as unknown as ReturnType<typeof useStreamSnapshot>)
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionResumed('Living room'))
    tell('bbb', 'Beta')
    expect(screen.getByTestId('cast-panel')).toHaveTextContent('Beta')
    expect(screen.getByRole('button', { name: 'Stop casting' })).toBeInTheDocument()
  })

  it('say what can be done by what the TV says: Play when it is paused, also after a reload', async () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    mount('/hls-dash/aaa')
    ready()
    act(() => fake.sessionResumed('Living room'))
    tell('aaa', 'Alpha', 'paused')
    await click(screen.getByRole('button', { name: 'Play' }))
    expect(fake.playOrPause).toHaveBeenCalledTimes(1)
    tell('aaa', 'Alpha', 'playing')
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('say why a pick did not go to the TV', async () => {
    await casting()
    tell('aaa', 'Alpha')
    await click(screen.getByText('paste mp4'))
    expect(loaded()).toEqual(['aaa'])
    expect(screen.getByTestId('cast-panel')).toHaveTextContent('Only HLS and DASH streams can be cast')
  })
})
