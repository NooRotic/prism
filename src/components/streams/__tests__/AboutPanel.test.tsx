import { act, fireEvent, render, screen } from '@testing-library/react'
import AboutPanel from '../AboutPanel'
import { beginPlayback, endPlayback, setPlaybackStatus } from '../../../lib/playbackLog'
import type { StreamEntry } from '../../../lib/streamsApi'

vi.mock('../../../config/historyServer', () => ({
  HISTORY_ENABLED: true,
  HISTORY_API_URL: 'https://history.test',
  SEND_VISITS: false,
}))

const GROUPS = ['Other', 'General', 'News']

function stream(over: Partial<StreamEntry> = {}): StreamEntry {
  return {
    id: '0123456789ab',
    name: 'Alpha News',
    groups: [1, 2],
    country: 'us',
    logo: null,
    kind: 'hls',
    pinned: false,
    state: 'new',
    url: 'https://edge-3.cdn.test:8443/live/secret-path/a.m3u8?token=SECRET123&x=1',
    ...over,
  }
}

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('AboutPanel and the playback status', () => {
  const ADDRESS = 'https://edge-3.cdn.test/live/a.m3u8'
  afterEach(() => endPlayback())

  it('shows the PLAYBACK button and the console output under the details while a stream is running, and neither when none is', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    expect(screen.queryByRole('button', { name: /PLAYBACK/ })).toBeNull()
    expect(screen.queryByText('Console output')).toBeNull()

    act(() => beginPlayback({ url: ADDRESS, kind: 'hls' }))

    expect(screen.getByRole('button', { name: /PLAYBACK/ })).toBeInTheDocument()
    expect(screen.getByText('Console output')).toBeInTheDocument()
  })

  it('does not fold while playback is retrying, and folds thirty seconds after it plays', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    act(() => beginPlayback({ url: ADDRESS, kind: 'hls' }))
    act(() => setPlaybackStatus('retrying'))

    tick(120_000)
    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()

    act(() => setPlaybackStatus('playing'))
    tick(30_000)
    expect(screen.queryByRole('heading', { name: 'Alpha News' })).toBeNull()
  })

  it('opens a folded panel, with the debug output showing, when playback starts failing', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    act(() => beginPlayback({ url: ADDRESS, kind: 'hls' }))
    act(() => setPlaybackStatus('playing'))
    tick(30_000)
    expect(screen.queryByRole('heading', { name: 'Alpha News' })).toBeNull()

    act(() => setPlaybackStatus('failed'))

    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()
    expect(screen.getByLabelText('Playback debug output')).toBeInTheDocument()
  })
})

describe('AboutPanel', () => {
  it('shows the name, the flag and country, the groups, the kind and that nobody has checked the stream', () => {
    const { container } = render(<AboutPanel stream={stream()} groups={GROUPS} />)

    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()
    expect(container.querySelector('img[src*="us.svg"], img[src^="data:image/svg"]')).not.toBeNull()
    expect(screen.getByText('United States')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('News')).toBeInTheDocument()
    expect(screen.getByText(/HLS/)).toBeInTheDocument()
    expect(screen.getByText(/not checked yet/i)).toBeInTheDocument()
  })

  it('says DASH for a DASH stream, and does not say "not checked" for a stream that works', () => {
    render(<AboutPanel stream={stream({ kind: 'dash', state: 'working' })} groups={GROUPS} />)

    expect(screen.getByText(/DASH/)).toBeInTheDocument()
    expect(screen.queryByText(/not checked yet/i)).toBeNull()
  })

  it('shows the large channel picture, or a letter tile when there is none', () => {
    const { container, rerender } = render(<AboutPanel stream={stream({ logo: '0123456789ab.png' })} groups={GROUPS} />)
    expect(container.querySelector('img[src="https://history.test/logos/0123456789ab.png"]')).not.toBeNull()

    rerender(<AboutPanel stream={stream({ logo: null })} groups={GROUPS} />)
    expect(container.querySelector('[data-letter-tile]')).not.toBeNull()
  })

  it('shows the source host and never the full address', () => {
    const { container } = render(<AboutPanel stream={stream()} groups={GROUPS} />)

    expect(screen.getByText('edge-3.cdn.test:8443')).toBeInTheDocument()
    const html = container.innerHTML
    expect(html).not.toContain('SECRET123')
    expect(html).not.toContain('secret-path')
    expect(html).not.toContain('a.m3u8')
    expect(html).not.toContain('token')
  })

  it('shows markup in a name or a group as text', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const { container } = render(<AboutPanel stream={stream({ name: evil, groups: [0] })} groups={[evil]} />)

    expect(screen.getByRole('heading', { name: evil })).toBeInTheDocument()
    expect(screen.getAllByText(evil).length).toBeGreaterThan(0)
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('asks the visitor to choose a stream when there is none', () => {
    render(<AboutPanel stream={null} groups={GROUPS} />)

    expect(screen.getByText(/choose a stream/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('folds after thirty seconds into a slim tab, and the tab opens it again', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()

    tick(30_000)
    expect(screen.queryByRole('heading', { name: 'Alpha News' })).toBeNull()
    const tab = screen.getByRole('button', { name: /about this stream/i })

    fireEvent.click(tab)

    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()
    tick(29_999)
    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()
    tick(1)
    expect(screen.queryByRole('heading', { name: 'Alpha News' })).toBeNull()
  })

  it('opens again by itself when another stream starts', () => {
    const { rerender } = render(<AboutPanel stream={stream()} groups={GROUPS} />)
    tick(30_000)
    expect(screen.queryByRole('heading')).toBeNull()

    rerender(<AboutPanel stream={stream({ id: 'ba9876543210', name: 'Beta' })} groups={GROUPS} />)

    expect(screen.getByRole('heading', { name: 'Beta' })).toBeInTheDocument()
  })

  it('hovering and clicking inside the panel start the thirty seconds again', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    const heading = screen.getByRole('heading', { name: 'Alpha News' })

    tick(20_000)
    fireEvent.mouseEnter(heading.closest('aside') as HTMLElement)
    tick(29_999)
    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()

    tick(1)
    expect(screen.queryByRole('heading')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /about this stream/i }))
    tick(20_000)
    fireEvent.click(screen.getByRole('heading', { name: 'Alpha News' }))
    tick(29_999)
    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()
  })

  it('has a Close button that folds the panel into its tab at once, and the tab opens it again', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close this panel' }))

    expect(screen.queryByRole('heading', { name: 'Alpha News' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /about this stream/i }))
    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()
  })

  it('closing lets go of a pin, so the panel is not held open the next time', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep this panel open' }))
    expect(screen.getByRole('button', { name: 'Let this panel fold away' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Close this panel' }))
    fireEvent.click(screen.getByRole('button', { name: /about this stream/i }))

    expect(screen.getByRole('button', { name: 'Keep this panel open' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('gives the folded tab larger text, the main text colour, a visible border and a bigger icon', () => {
    const { container } = render(<AboutPanel stream={stream()} groups={GROUPS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close this panel' }))

    const tab = screen.getByRole('button', { name: /about this stream/i })
    expect(tab.className).toContain('text-[var(--text-primary)]')
    expect(tab.className).toContain('border-[var(--text-muted)]')
    expect(screen.getByText('About this stream', { selector: 'span' }).className).toContain('text-base')
    expect(screen.getByText('About this stream', { selector: 'span' }).className).not.toContain('text-xs')
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('22')
  })

  it('a pin keeps it open', () => {
    render(<AboutPanel stream={stream()} groups={GROUPS} />)
    const pin = screen.getByRole('button', { name: /keep.*open/i })
    expect(pin.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(pin)
    tick(10 * 60_000)

    expect(screen.getByRole('heading', { name: 'Alpha News' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /keep.*open|fold/i }).getAttribute('aria-pressed')).toBe('true')
  })

  it('never takes keyboard focus, when it opens, reopens or changes stream', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()

    const { rerender } = render(<AboutPanel stream={stream()} groups={GROUPS} />)
    expect(document.activeElement).toBe(outside)

    tick(30_000)
    rerender(<AboutPanel stream={stream({ id: 'ba9876543210', name: 'Beta' })} groups={GROUPS} />)
    expect(document.activeElement).toBe(outside)

    tick(30_000)
    rerender(<AboutPanel stream={stream({ id: 'cccccccccccc', name: 'Gamma' })} groups={GROUPS} />)
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('slides in when it opens, and skips the movement for a visitor who asked for less of it', () => {
    const animate = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate })
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('reduce') ? false : false, media: query }))
    vi.stubGlobal('matchMedia', matchMedia)
    const { unmount } = render(<AboutPanel stream={stream()} groups={GROUPS} />)
    expect(animate).toHaveBeenCalledTimes(1)
    unmount()

    animate.mockClear()
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query })),
    )
    render(<AboutPanel stream={stream()} groups={GROUPS} />)

    expect(animate).not.toHaveBeenCalled()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.unstubAllGlobals()
  })
})
