import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import ChatTextSize from '../ChatTextSize'

function renderCluster(overrides: Partial<React.ComponentProps<typeof ChatTextSize>> = {}) {
  const props = {
    scale: 1,
    canSmaller: true,
    canLarger: true,
    onSmaller: vi.fn(),
    onLarger: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  }
  render(<ChatTextSize {...props} />)
  return props
}

describe('ChatTextSize', () => {
  it('renders smaller, larger and reset buttons, with the percentage', () => {
    renderCluster()
    expect(screen.getByRole('button', { name: 'Smaller chat text' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Larger chat text' })).toBeInTheDocument()
    const reset = screen.getByRole('button', { name: 'Reset chat text size, 100%' })
    expect(reset).toHaveTextContent('100%')
  })

  it.each([
    [0.7, '70%'],
    [0.85, '85%'],
    [1.15, '115%'],
    [1.3, '130%'],
    [1.75, '175%'],
    [2, '200%'],
  ])('shows %s as %s', (scale, label) => {
    renderCluster({ scale })
    expect(screen.getByRole('button', { name: `Reset chat text size, ${label}` })).toHaveTextContent(label)
  })

  it('each button calls its own handler', () => {
    const props = renderCluster()
    fireEvent.click(screen.getByRole('button', { name: 'Smaller chat text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Larger chat text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset chat text size, 100%' }))
    expect(props.onSmaller).toHaveBeenCalledOnce()
    expect(props.onLarger).toHaveBeenCalledOnce()
    expect(props.onReset).toHaveBeenCalledOnce()
  })

  // A button that becomes `disabled` drops keyboard focus to the page body, so at
  // the end of the range it is aria-disabled instead: still focusable, ignores clicks.
  it('marks smaller aria-disabled at the smallest size and ignores clicks', () => {
    const props = renderCluster({ scale: 0.7, canSmaller: false })
    const smaller = screen.getByRole('button', { name: 'Smaller chat text' })

    expect(smaller).toHaveAttribute('aria-disabled', 'true')
    expect(smaller).not.toBeDisabled()
    fireEvent.click(smaller)

    expect(props.onSmaller).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Larger chat text' })).toHaveAttribute('aria-disabled', 'false')
  })

  it('marks larger aria-disabled at the largest size and ignores clicks', () => {
    const props = renderCluster({ scale: 2, canLarger: false })
    const larger = screen.getByRole('button', { name: 'Larger chat text' })

    expect(larger).toHaveAttribute('aria-disabled', 'true')
    expect(larger).not.toBeDisabled()
    fireEvent.click(larger)

    expect(props.onLarger).not.toHaveBeenCalled()
  })

  it('keeps focus on the button that was clicked, even at the end of the range', () => {
    renderCluster({ scale: 2, canLarger: false })
    const larger = screen.getByRole('button', { name: 'Larger chat text' })
    larger.focus()

    fireEvent.click(larger)

    expect(document.activeElement).toBe(larger)
  })

  it('keeps reset available at 100%, so it never becomes a dead button', () => {
    const props = renderCluster({ scale: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Reset chat text size, 100%' }))
    expect(props.onReset).toHaveBeenCalledOnce()
  })

  it('is a labelled group of real buttons', () => {
    renderCluster()
    expect(screen.getByRole('group', { name: 'Chat text size' })).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button')
    }
  })
})
