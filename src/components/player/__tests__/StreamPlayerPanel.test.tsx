import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach } from 'vitest'
import StreamPlayerPanel from '../StreamPlayerPanel'
import { resolveStreamSource } from '../../../lib/streamSource'

// When `failWith` is set, the stand-in player gives up at once, so the panel shows its error view.
const mocks = vi.hoisted(() => ({ failWith: null as string | null }))
vi.mock('../PlayerHost', () => ({
  default: ({ renderError }: { renderError?: (error: string | null) => React.ReactNode }) => (
    <div data-testid="player-host">{mocks.failWith !== null && renderError ? renderError(mocks.failWith) : null}</div>
  ),
}))
vi.mock('../StreamStatus', () => ({
  StreamErrorCard: ({ onTryAs }: { onTryAs: (kind: 'hls' | 'dash' | 'mp4') => void }) => (
    <div data-testid="error-card">
      <button type="button" onClick={() => onTryAs('dash')}>
        try as dash
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
