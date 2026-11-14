import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import HlsPage from '../HlsPage'
import { STORAGE_KEYS } from '../../config/storageKeys'
import { useApp } from '../../contexts/AppContext'
import { useStreamSnapshot, type StreamSnapshotState } from '../../hooks/useStreamSnapshot'
import { buildStreamPath } from '../../lib/routes'
import type { StreamEntry, StreamSnapshot } from '../../lib/streamsApi'

vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useStreamSnapshot', () => ({ useStreamSnapshot: vi.fn() }))

// The player itself is its own tested component: here it is a marker that shows what the page asked it to play.
vi.mock('../../components/player/StreamPlayerPanel', () => ({
  default: (props: { source: { url: string; kind: string }; heading?: boolean; className?: string }) => (
    <div data-testid="player-panel" data-url={props.source.url} data-kind={props.source.kind} data-heading={String(props.heading)} />
  ),
}))

const BBB = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

function entry(over: Partial<StreamEntry> & { id: string; name: string }): StreamEntry {
  return { groups: [0], country: null, logo: null, kind: 'hls', pinned: false, state: 'new', url: `https://${over.id}.test/live.m3u8`, ...over }
}

const ALPHA = entry({ id: 'aaaaaaaaaaaa', name: 'Alpha One', groups: [1], country: 'us', pinned: true, state: 'working' })
const BETA = entry({ id: 'bbbbbbbbbbbb', name: 'Beta Two', groups: [1, 2] })
const GAMMA = entry({ id: 'cccccccccccc', name: 'Gamma Three', groups: [2], kind: 'dash', url: 'https://gamma.test/manifest.mpd' })
const BUNNY = entry({ id: 'dddddddddddd', name: 'Big Buck Bunny', groups: [0], pinned: true, state: 'working', url: BBB })

const SNAPSHOT: StreamSnapshot = {
  generated: '2026-11-14T05:00:00Z',
  defaultId: ALPHA.id,
  groups: ['Other', 'News', 'Sports'],
  streams: [ALPHA, BUNNY, BETA, GAMMA],
}

const ready = (snapshot: StreamSnapshot = SNAPSHOT): StreamSnapshotState => ({ status: 'ready', snapshot })
const loading: StreamSnapshotState = { status: 'loading', snapshot: null }
const unavailable: StreamSnapshotState = { status: 'unavailable', snapshot: null }

function LocationSpy() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

const dispatch = vi.fn()

function renderAt(path: string, snapshot: StreamSnapshotState = ready()) {
  vi.mocked(useStreamSnapshot).mockReturnValue(snapshot)
  vi.mocked(useApp).mockReturnValue({
    state: { player: { currentUrl: null, detection: null } },
    dispatch,
  } as unknown as ReturnType<typeof useApp>)
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="hls-dash/:streamId?" element={<HlsPage />} />
      </Routes>
      <LocationSpy />
    </MemoryRouter>,
  )
}

const playerUrl = () => screen.getByTestId('player-panel').getAttribute('data-url')
/** The names on the cards in view: the letter tile and the Pinned / Unchecked marks are not part of a name. */
const cardNames = () =>
  within(screen.getByRole('region', { name: /stream list/i }))
    .queryAllByRole('button')
    .map((button) => {
      const copy = button.cloneNode(true) as HTMLElement
      copy.querySelector('[data-letter-tile]')?.remove()
      return (copy.textContent ?? '').replace(/(Pinned|Unchecked)/g, '').trim()
    })

beforeEach(() => {
  vi.clearAllMocks()
  // The page remembers the chosen group in local storage: no test starts with another's choice.
  localStorage.clear()
})

describe('HlsPage: what plays', () => {
  it('plays the list\'s default when no stream is named', () => {
    renderAt('/hls-dash')

    expect(playerUrl()).toBe(ALPHA.url)
    expect(screen.getByTestId('player-panel').getAttribute('data-heading')).toBe('false')
  })

  it('plays Big Buck Bunny when the list has no default of its own', () => {
    renderAt('/hls-dash', ready({ ...SNAPSHOT, defaultId: null }))

    expect(playerUrl()).toBe(BBB)
  })

  it('plays Big Buck Bunny when the default it names is not in the list', () => {
    renderAt('/hls-dash', ready({ ...SNAPSHOT, defaultId: 'ffffffffffff' }))

    expect(playerUrl()).toBe(BBB)
  })

  it('plays the stream named in the address', () => {
    renderAt(`/hls-dash/${BETA.id}`)

    expect(playerUrl()).toBe(BETA.url)
  })

  it('plays a DASH entry as DASH', () => {
    renderAt(`/hls-dash/${GAMMA.id}`)

    expect(screen.getByTestId('player-panel').getAttribute('data-kind')).toBe('dash')
  })

  it('still plays a demo by its demo id', () => {
    renderAt('/hls-dash/apple-basic')

    expect(playerUrl()).toContain('bipbop_16x9_variant.m3u8')
  })

  it('still plays a pasted address from the custom path, with the list visible', () => {
    renderAt(buildStreamPath('https://pasted.test/live/x.m3u8'))

    expect(playerUrl()).toBe('https://pasted.test/live/x.m3u8')
    expect(cardNames().length).toBeGreaterThan(0)
  })

  it('sends an old /hls-dash?url= link on to the custom path, keeping the address intact', () => {
    const address = 'https://h/p.m3u8?token=a=b&c=d%20e'
    renderAt(`/hls-dash?url=${encodeURIComponent(address)}`)

    expect(screen.getByTestId('location')).toHaveTextContent(buildStreamPath(address))
  })

  it('tells the rest of the app what is playing', () => {
    renderAt(`/hls-dash/${BETA.id}`)

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'PLAY_URL', url: BETA.url }))
  })

  it('says so, with the list still there, for an id nobody knows', () => {
    renderAt('/hls-dash/ffffffffffff')

    expect(screen.getByText(/no stream called/i)).toBeInTheDocument()
    expect(screen.queryByTestId('player-panel')).toBeNull()
    expect(cardNames()).toHaveLength(4)
  })

  it('says why for a custom path with no address, and for an address that is not a stream', () => {
    const { unmount } = renderAt('/hls-dash/custom')
    expect(screen.getByText('No stream address was given.')).toBeInTheDocument()
    unmount()

    renderAt(buildStreamPath('https://twitch.tv/xqc'))
    expect(screen.getByText("That address isn't an HLS, DASH or MP4 stream.")).toBeInTheDocument()
  })

  it('waits for the list before judging an id it has not seen yet, instead of calling it unknown', () => {
    renderAt(`/hls-dash/${BETA.id}`, loading)

    expect(screen.queryByText(/no stream called/i)).toBeNull()
    expect(screen.queryByTestId('player-panel')).toBeNull()
    expect(screen.getByText('Loading stream…')).toBeInTheDocument()
  })

  it('plays the default demo straight away while the list loads, and shows no list until it has one', () => {
    renderAt('/hls-dash', loading)

    expect(playerUrl()).toBe(BBB)
    expect(screen.getByText(/loading streams/i)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /stream list/i })).toBeNull()
  })
})

describe('HlsPage: the list', () => {
  it('shows every stream of the list', () => {
    renderAt('/hls-dash')

    expect(cardNames()).toEqual(['Alpha One', 'Big Buck Bunny', 'Beta Two', 'Gamma Three'])
  })

  it('choosing a card moves the address to that stream and plays it', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash')

    await user.click(screen.getByRole('button', { name: /Beta Two/ }))

    expect(screen.getByTestId('location')).toHaveTextContent(`/hls-dash/${BETA.id}`)
    expect(playerUrl()).toBe(BETA.url)
  })

  it('keeps what was typed and chosen in the filters when another stream is picked', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash')
    await user.click(screen.getByRole('button', { name: /^News/ }))
    await user.type(screen.getByRole('searchbox'), 'two')

    await user.click(screen.getByRole('button', { name: /Beta Two/ }))

    expect(screen.getByTestId('location')).toHaveTextContent(`/hls-dash/${BETA.id}`)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('two')
    expect(screen.getByRole('button', { name: /^News/ }).getAttribute('aria-pressed')).toBe('true')
    expect(cardNames()).toEqual(['Beta Two'])
  })

  it('marks the card that is playing, found by its address', () => {
    renderAt('/hls-dash/apple-basic', ready({ ...SNAPSHOT, streams: [...SNAPSHOT.streams, entry({ id: 'eeeeeeeeeeee', name: 'Apple demo', url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8' })] }))

    const marked = within(screen.getByRole('region', { name: /stream list/i }))
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-current') === 'true')
    expect(marked.map((b) => b.textContent)).toEqual([expect.stringContaining('Apple demo')])
  })

  it('searches by name, every word, ignoring case and accents', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash', ready({ ...SNAPSHOT, streams: [...SNAPSHOT.streams, entry({ id: 'ffffffffffff', name: 'Télévision Nord' })] }))

    await user.type(screen.getByRole('searchbox', { name: /search streams/i }), 'TELE nord')

    expect(cardNames()).toHaveLength(1)
    expect(cardNames()[0]).toBe('Télévision Nord')

    await user.clear(screen.getByRole('searchbox', { name: /search streams/i }))
    expect(cardNames()).toHaveLength(5)
  })

  it('filters by group with pills that show how many each holds', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash')

    expect(screen.getByRole('button', { name: /all streams.*4/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^News.*2/ }))

    expect(cardNames()).toEqual(['Alpha One', 'Beta Two'])
    expect(screen.getByRole('button', { name: /^News.*2/ }).getAttribute('aria-pressed')).toBe('true')

    await user.click(screen.getByRole('button', { name: /all streams/i }))
    expect(cardNames()).toHaveLength(4)
  })

  it('combines the search and the group', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash')

    await user.click(screen.getByRole('button', { name: /^Sports/ }))
    await user.type(screen.getByRole('searchbox'), 'beta')

    expect(cardNames()).toHaveLength(1)
    expect(cardNames()[0]).toContain('Beta Two')
  })

  it('says so when nothing matches', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash')

    await user.type(screen.getByRole('searchbox'), 'zzzz')

    expect(screen.getByText('No streams match.')).toBeInTheDocument()
  })

  it('shows markup in a stream or group name as text', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const { container } = renderAt('/hls-dash', ready({ ...SNAPSHOT, groups: ['Other', evil, 'Sports'], streams: [entry({ id: 'aaaaaaaaaaaa', name: evil, groups: [1] })], defaultId: 'aaaaaaaaaaaa' }))

    expect(screen.getAllByText(evil).length).toBeGreaterThan(0)
    expect(container.querySelector('img[src="x"]')).toBeNull()
  })
})

describe('HlsPage: when the server cannot give a list', () => {
  it.each([
    ['is down or says it is not ready', unavailable],
    ['sends a list with nothing in it', ready({ ...SNAPSHOT, defaultId: null, groups: [], streams: [] })],
  ])('when it %s, shows the built-in demo streams with a notice, and plays the demo default', (_label, snapshot) => {
    renderAt('/hls-dash', snapshot)

    expect(screen.getByText(/showing the built-in demo streams/i)).toBeInTheDocument()
    expect(cardNames()).toEqual([
      'Apple HLS Basic',
      'Apple 4K HEVC',
      'Big Buck Bunny',
      'Big Buck Bunny DASH',
      'Envivio DASH',
    ])
    expect(playerUrl()).toBe(BBB)
  })

  it('does not show the notice when the list is the real one', () => {
    renderAt('/hls-dash')

    expect(screen.queryByText(/showing the built-in demo streams/i)).toBeNull()
  })

  it('a demo card still plays by its demo id', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash', unavailable)

    await user.click(screen.getByRole('button', { name: /Apple 4K HEVC/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/hls-dash/apple-4k')
    expect(playerUrl()).toContain('adv_dv_atmos/main.m3u8')
  })
})

describe('HlsPage: the rest of the page', () => {
  // Moved here from ProtocolPage.twitch.test.tsx ("leaves the HLS / DASH page as it was, with no connect card").
  it('is not the Twitch page: no connect card and no dashboard', () => {
    renderAt('/hls-dash', unavailable)

    expect(screen.queryByText('Connect Twitch to see who you follow that is live.')).not.toBeInTheDocument()
    expect(screen.queryByTestId('twitch-dashboard')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: /stream list/i })).toBeInTheDocument()
  })

  it('credits the iptv-org project as the source of the list', () => {
    renderAt('/hls-dash')

    const credit = screen.getByText(/iptv-org/i)
    expect(credit).toBeInTheDocument()
    expect(credit.closest('a')?.getAttribute('href')).toBe('https://github.com/iptv-org/iptv')
    expect(credit.closest('a')?.getAttribute('rel')).toContain('noopener')
  })

  it('shows what is playing in the About panel, never the full address', () => {
    renderAt(`/hls-dash/${BETA.id}`)

    const panel = screen.getByRole('complementary', { name: /about this stream/i })
    expect(within(panel).getByRole('heading', { name: 'Beta Two' })).toBeInTheDocument()
    expect(within(panel).getByText('bbbbbbbbbbbb.test')).toBeInTheDocument()
    expect(panel.innerHTML).not.toContain('live.m3u8')
  })

  it('describes a pasted address in the About panel by its host', () => {
    renderAt(buildStreamPath('https://pasted.test:8443/live/secret/x.m3u8?token=SECRET'))

    const panel = screen.getByRole('complementary', { name: /about this stream/i })
    expect(within(panel).getByText('pasted.test:8443')).toBeInTheDocument()
    expect(panel.innerHTML).not.toContain('SECRET')
    expect(panel.innerHTML).not.toContain('secret/x')
  })

  it('opens the About panel again when another stream is chosen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderAt('/hls-dash')
      act(() => void vi.advanceTimersByTime(30_000))
      expect(screen.queryByRole('heading', { name: 'Alpha One', level: 2 })).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: /Beta Two/ }))

      expect(screen.getByRole('heading', { name: 'Beta Two', level: 2 })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('HlsPage: the remembered group', () => {
  const KEY = STORAGE_KEYS.LOCAL_HLS_GROUP
  const pill = (name: RegExp) => screen.getByRole('button', { name })

  it('saves the group the visitor chooses, by its name', async () => {
    const user = userEvent.setup()
    renderAt('/hls-dash')

    await user.click(pill(/^News.*2/))

    expect(localStorage.getItem(KEY)).toBe('News')
  })

  it('shows the saved group again after a reload, with only its streams', () => {
    localStorage.setItem(KEY, 'News')

    renderAt('/hls-dash')

    expect(pill(/^News.*2/).getAttribute('aria-pressed')).toBe('true')
    expect(pill(/all streams/i).getAttribute('aria-pressed')).toBe('false')
    expect(cardNames()).toEqual(['Alpha One', 'Beta Two'])
  })

  it('forgets the choice when the visitor goes back to all streams', async () => {
    const user = userEvent.setup()
    localStorage.setItem(KEY, 'Sports')
    renderAt('/hls-dash')

    await user.click(pill(/all streams/i))

    expect(localStorage.getItem(KEY)).toBeNull()
    expect(cardNames()).toHaveLength(4)
  })

  it('follows the name, not the position, when the groups change between visits', () => {
    localStorage.setItem(KEY, 'Sports')

    renderAt('/hls-dash', ready({ ...SNAPSHOT, groups: ['Other', 'Sports', 'News'], streams: [ALPHA, BUNNY, BETA, GAMMA] }))

    expect(pill(/^Sports/).getAttribute('aria-pressed')).toBe('true')
    expect(pill(/^News/).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows every stream when the saved group is not in the list that is showing, and keeps the choice for when it is', () => {
    localStorage.setItem(KEY, 'News')

    const demos = renderAt('/hls-dash', unavailable)
    expect(pill(/all streams/i).getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem(KEY)).toBe('News')
    demos.unmount()

    renderAt('/hls-dash', ready())
    expect(pill(/^News.*2/).getAttribute('aria-pressed')).toBe('true')
  })

  it('does not wipe the saved group while the list is still loading', () => {
    localStorage.setItem(KEY, 'News')

    renderAt('/hls-dash', loading)

    expect(localStorage.getItem(KEY)).toBe('News')
  })

  it('still filters when local storage cannot be read or written', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked')
    })
    renderAt('/hls-dash')

    await user.click(pill(/^News.*2/))
    expect(cardNames()).toEqual(['Alpha One', 'Beta Two'])
    await user.click(pill(/all streams/i))

    expect(cardNames()).toHaveLength(4)
    vi.restoreAllMocks()
  })
})
