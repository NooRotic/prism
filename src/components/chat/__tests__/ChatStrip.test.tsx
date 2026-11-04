import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import ChatStrip from '../ChatStrip'
import type { DockSide } from '../chatPlacement'

function renderStrip(overrides: Partial<React.ComponentProps<typeof ChatStrip>> = {}) {
  const props = {
    side: 'right' as DockSide,
    restoreLabel: 'Show chat',
    onRestore: vi.fn(),
    fill: false,
    onToggleFill: vi.fn(),
    fullscreenSupported: true,
    isFullscreen: false,
    onToggleFullscreen: vi.fn(),
    ...overrides,
  }
  render(<ChatStrip {...props} />)
  return props
}

describe('ChatStrip', () => {
  it('shows the restore, fill and fullscreen buttons', () => {
    renderStrip()
    expect(screen.getByRole('button', { name: 'Show chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill window' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fullscreen chat and video' })).toBeInTheDocument()
  })

  it('uses the label it is given for the restore button', () => {
    renderStrip({ restoreLabel: 'Return chat to the page' })
    expect(screen.getByRole('button', { name: 'Return chat to the page' })).toBeInTheDocument()
  })

  it('each button calls its own handler', () => {
    const props = renderStrip()
    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fill window' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen chat and video' }))
    expect(props.onRestore).toHaveBeenCalledOnce()
    expect(props.onToggleFill).toHaveBeenCalledOnce()
    expect(props.onToggleFullscreen).toHaveBeenCalledOnce()
  })

  it('offers the way out of fill mode and reflects it with aria-pressed', () => {
    renderStrip({ fill: true })
    const exit = screen.getByRole('button', { name: 'Exit fill mode' })
    expect(exit).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Fill window' })).not.toBeInTheDocument()
  })

  it('offers the way out of fullscreen and reflects it with aria-pressed', () => {
    renderStrip({ isFullscreen: true })
    const exit = screen.getByRole('button', { name: 'Exit fullscreen' })
    expect(exit).toHaveAttribute('aria-pressed', 'true')
  })

  it('has unpressed toggles when nothing is on', () => {
    renderStrip()
    expect(screen.getByRole('button', { name: 'Fill window' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Fullscreen chat and video' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('leaves out the fullscreen button when the browser cannot do fullscreen', () => {
    renderStrip({ fullscreenSupported: false })
    expect(screen.queryByRole('button', { name: /fullscreen/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill window' })).toBeInTheDocument()
  })

  it.each([
    ['right', 'md:ml-2'],
    ['left', 'md:mr-2'],
  ] as const)('keeps a gap on the player side when docked %s', (side, gap) => {
    renderStrip({ side })
    expect(screen.getByTestId('chat-strip')).toHaveClass(gap)
  })

  it('stacks as a column from md and as a bar below it', () => {
    renderStrip()
    expect(screen.getByTestId('chat-strip')).toHaveClass('flex', 'md:flex-col', 'md:w-8')
  })

  it('is never hidden at any width, so there is always a way out', () => {
    renderStrip({ fill: true })
    expect(screen.getByTestId('chat-strip')).not.toHaveClass('hidden')
    expect(screen.getByRole('button', { name: 'Exit fill mode' })).not.toHaveClass('hidden')
  })
})
