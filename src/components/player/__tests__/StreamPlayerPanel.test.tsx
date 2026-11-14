import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach } from 'vitest'
import StreamPlayerPanel from '../StreamPlayerPanel'
import { endPlayback, getPlaybackSnapshot, logPlayback } from '../../../lib/playbackLog'
import { resolveStreamSource } from '../../../lib/streamSource'

// When `failWith` is set, the stand-in player gives up at once, so the panel shows its error view.
// When `logOnRender` is set it also writes one line to the playback log from an effect, as a real engine would.
const mocks = vi.hoisted(() => ({ failWith: null as string | null, logOnRender: false }))
vi.mock('../PlayerHost', () => ({
  default: function MockPlayerHost({ renderError }: { renderError?: (error: string | null) => React.ReactNode }) {
    useEffect(() => {
      if (mocks.logOnRender) logPlayback('info', 'test', 'player rendered')
    }, [])
    return <div data-testid="player-host">{mocks.failWith !== null && renderError ? renderError(mocks.failWith) : null}</div>
  },
}))
vi.mock('../StreamStatus', () => ({
  StreamErrorCard: ({ onTryAs, onRetry }: { onTryAs: (kind: 'hls' | 'dash' | 'mp4') => void; onRetry: () => void }) => (
    <div data-testid="error-card">
      <button type="button" onClick={() => onTryAs('dash')}>
        try as dash
      </button>
      <button type="button" onClick={onRetry}>
        retry
      </button>
    </div>
  ),
  StreamStallNotice: () => <div data-testid="stall-notice" />,
}))
vi.mock('../../layout/DebugPanel', () => ({ default: () => <div data-testid="debug-panel" /> }))

const source = resolveStreamSource('custom', new URLSearchParams({ url: 'https://x.test/live/a.m3u8' }))!

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function renderPanel(props: Partial<React.ComponentProps<typeof StreamPlayerPanel>> = {}) {
  return render(
    <MemoryRouter>
      <StreamPlayerPanel source={source} {...props} />
      <Where />
    </MemoryRouter>,
  )
}

afterEach(() => {
  mocks.failWith = null
  endPlayback()
})

describe('StreamPlayerPanel', () => {
  it('keeps the title row (the kind of player and the address) by default', () => {
    renderPanel()

    expect(screen.getByRole('heading', { level: 2 }).textContent).toMatch(/player$/i)
    expect(screen.getByText('https://x.test/live/a.m3u8')).toBeInTheDocument()
    expect(screen.getByTestId('player-host')).toBeInTheDocument()
    expect(screen.getByTestId('debug-panel')).toBeInTheDocument()
  })

  it('leaves the title row out when asked: the new HLS page names the stream in its own panel', () => {
    renderPanel({ heading: false })

    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByText('https://x.test/live/a.m3u8')).toBeNull()
    expect(screen.getByTestId('player-host')).toBeInTheDocument()
  })

  it('takes its own wrapper classes, so a page can place it in a column', () => {
    const { container } = renderPanel({ className: 'my-column' })

    expect(container.firstElementChild?.className).toBe('my-column')
  })
})

describe('StreamPlayerPanel: the playback log', () => {
  it('begins a session for its address and kind, and ends it when it goes away', () => {
    const view = renderPanel()

    expect(getPlaybackSnapshot()).toMatchObject({ status: 'starting', url: 'https://x.test/live/a.m3u8', kind: 'hls', attempts: 1 })

    view.unmount()

    expect(getPlaybackSnapshot().status).toBe('idle')
  })

  it('is ready before the player below it writes its first line', () => {
    mocks.logOnRender = true

    renderPanel()

    expect(getPlaybackSnapshot().entries.map((entry) => entry.message)).toContain('player rendered')
    mocks.logOnRender = false
  })

  it('says "failed" in the log and the status when the error view appears', () => {
    mocks.failWith = 'boom'

    renderPanel()

    const snapshot = getPlaybackSnapshot()
    expect(snapshot.status).toBe('failed')
    expect(snapshot.entries.at(-1)).toMatchObject({ level: 'error', source: 'panel' })
  })

  it('writes down a Retry and counts it as a new attempt', async () => {
    mocks.failWith = 'boom'
    renderPanel()

    await userEvent.setup().click(screen.getByRole('button', { name: 'retry' }))

    const snapshot = getPlaybackSnapshot()
    expect(snapshot.attempts).toBe(2)
    expect(snapshot.entries.map((entry) => entry.message)).toEqual(expect.arrayContaining(['Retry pressed', 'Attempt 2: retrying']))
  })
})

describe('StreamPlayerPanel: "try as"', () => {
  it('goes to the pasted-address page as that type when the page gives no handler', async () => {
    mocks.failWith = 'boom'
    renderPanel()

    await userEvent.setup().click(screen.getByRole('button', { name: 'try as dash' }))

    expect(screen.getByTestId('where').textContent).toBe('/hls-dash/custom?url=https%3A%2F%2Fx.test%2Flive%2Fa.m3u8&as=dash')
  })

  it('hands the type to onTryAs instead of navigating when the page gives one', async () => {
    mocks.failWith = 'boom'
    const onTryAs = vi.fn()
    renderPanel({ onTryAs })

    await userEvent.setup().click(screen.getByRole('button', { name: 'try as dash' }))

    expect(onTryAs).toHaveBeenCalledWith('dash')
    expect(screen.getByTestId('where').textContent).toBe('/')
  })
})
