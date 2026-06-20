import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { ExpandablePill } from '../ExpandablePill'

describe('ExpandablePill', () => {
  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the label', () => {
    render(<ExpandablePill label="Gaming" />)
    expect(screen.getByText('Gaming')).toBeInTheDocument()
  })

  it('renders the icon when provided', () => {
    render(
      <ExpandablePill
        label="Gaming"
        icon={<span data-testid="my-icon">★</span>}
      />,
    )
    expect(screen.getByTestId('my-icon')).toBeInTheDocument()
  })

  it('omits the icon span when icon is not provided', () => {
    render(<ExpandablePill label="Gaming" />)
    // The pill row should have exactly one child: the label span.
    // If the icon wrapper were rendered it would have two children.
    const pill = screen.getByRole('button')
    const pillRow = pill.firstElementChild!
    expect(pillRow.childElementCount).toBe(1)
  })

  it('renders the description text when description prop is provided', () => {
    render(<ExpandablePill label="Gaming" description="Live gameplay streams" />)
    expect(screen.getByText('Live gameplay streams')).toBeInTheDocument()
  })

  it('omits the description div entirely when description is not provided', () => {
    render(<ExpandablePill label="Gaming" />)
    // The outer div should only contain the pill row, not a second child.
    const pill = screen.getByRole('button')
    expect(pill.childElementCount).toBe(1)
  })

  // ── Click & Keyboard interactions ─────────────────────────────────────────

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ExpandablePill label="Gaming" onClick={onClick} />)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick when Enter is pressed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ExpandablePill label="Gaming" onClick={onClick} />)
    screen.getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('calls onClick when Space is pressed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ExpandablePill label="Gaming" onClick={onClick} />)
    screen.getByRole('button').focus()
    await user.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClick on other keys', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ExpandablePill label="Gaming" onClick={onClick} />)
    screen.getByRole('button').focus()
    await user.keyboard('a')
    expect(onClick).not.toHaveBeenCalled()
  })

  // ── ARIA attributes ────────────────────────────────────────────────────────

  it('sets aria-label to "label: description" when description is provided', () => {
    render(<ExpandablePill label="Gaming" description="Live gameplay streams" />)
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Gaming: Live gameplay streams',
    )
  })

  it('sets aria-label to just the label when no description is provided', () => {
    render(<ExpandablePill label="Gaming" />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'Gaming')
  })

  it('sets aria-pressed to true when active={true}', () => {
    render(<ExpandablePill label="Gaming" active={true} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('sets aria-pressed to false by default', () => {
    render(<ExpandablePill label="Gaming" />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
  })

  it('has role="button" and tabIndex=0', () => {
    render(<ExpandablePill label="Gaming" />)
    const pill = screen.getByRole('button')
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveAttribute('tabindex', '0')
  })
})
