import { render, screen, act } from '@testing-library/react'
import StreamUptime from '../StreamUptime'

describe('StreamUptime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders elapsed time since started_at', () => {
    render(<StreamUptime startedAt="2026-09-20T09:24:42Z" />)
    expect(screen.getByText('2:35:18')).toBeInTheDocument()
  })

  it('ticks forward once per second', () => {
    render(<StreamUptime startedAt="2026-09-20T11:59:58Z" />)
    expect(screen.getByText('0:00:02')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('0:00:03')).toBeInTheDocument()
  })

  it('renders nothing when started_at is not a valid date', () => {
    const { container } = render(<StreamUptime startedAt="not-a-date" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('exposes an accessible label for screen readers', () => {
    render(<StreamUptime startedAt="2026-09-20T09:24:42Z" />)
    expect(screen.getByLabelText(/live for 2:35:18/i)).toBeInTheDocument()
  })
})
