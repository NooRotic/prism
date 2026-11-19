import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import VideoPopoutBar from '../VideoPopoutBar'
import { FloatingVideoContext } from '../floatingVideoContext'
import type { FloatingVideoControls } from '../floatingVideoContext'

function controls(over: Partial<FloatingVideoControls> = {}): FloatingVideoControls {
  return {
    supported: true,
    canOpen: true,
    isFloating: false,
    blocked: false,
    failed: false,
    open: vi.fn(),
    close: vi.fn(),
    registerSource: vi.fn(),
    ...over,
  }
}

function renderBar(value: FloatingVideoControls, props: { getStartSec?: () => number | undefined } = {}) {
  return render(
    <FloatingVideoContext.Provider value={value}>
      <VideoPopoutBar {...props} />
    </FloatingVideoContext.Provider>,
  )
}

describe('VideoPopoutBar', () => {
  it('shows nothing where the browser cannot float a video', () => {
    const { container } = renderBar(controls({ supported: false, canOpen: false }))
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing on a page that has not said what it shows', () => {
    const { container } = renderBar(controls({ canOpen: false }))
    expect(container).toBeEmptyDOMElement()
  })

  it('opens the window from the click, continuing from the time it is given', () => {
    const value = controls()
    renderBar(value, { getStartSec: () => 95 })
    fireEvent.click(screen.getByRole('button', { name: 'Pop out video' }))
    expect(value.open).toHaveBeenCalledWith({ startSec: 95 })
  })

  it('opens from the start when there is no time to read', () => {
    const value = controls()
    renderBar(value)
    fireEvent.click(screen.getByRole('button', { name: 'Pop out video' }))
    expect(value.open).toHaveBeenCalledWith({ startSec: undefined })
  })

  it('brings the video back while it floats', () => {
    const value = controls({ isFloating: true, canOpen: false })
    renderBar(value)
    const button = screen.getByRole('button', { name: 'Bring video back' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(value.close).toHaveBeenCalled()
  })

  it.each([
    [{ blocked: true }, "Couldn't open the floating window. Click the button again."],
    [{ failed: true }, "The video couldn't start in the floating window, so it was closed. Click the button to try again."],
  ])('says what went wrong: %j', (over, text) => {
    renderBar(controls(over))
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })
})
