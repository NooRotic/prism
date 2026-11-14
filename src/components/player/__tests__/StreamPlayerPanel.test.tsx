import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StreamPlayerPanel from '../StreamPlayerPanel'
import { resolveStreamSource } from '../../../lib/streamSource'

vi.mock('../PlayerHost', () => ({ default: () => <div data-testid="player-host" /> }))
vi.mock('../StreamStatus', () => ({
  StreamErrorCard: () => <div data-testid="error-card" />,
  StreamStallNotice: () => <div data-testid="stall-notice" />,
}))
vi.mock('../../layout/DebugPanel', () => ({ default: () => <div data-testid="debug-panel" /> }))

const source = resolveStreamSource('custom', new URLSearchParams({ url: 'https://x.test/live/a.m3u8' }))!

function renderPanel(props: Partial<React.ComponentProps<typeof StreamPlayerPanel>> = {}) {
  return render(
    <MemoryRouter>
      <StreamPlayerPanel source={source} {...props} />
    </MemoryRouter>,
  )
}

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
