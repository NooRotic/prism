import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MatrixRainBackground from '../MatrixRainBackground'

// An animating full-viewport canvas stops Twitch's embed from autoplaying
// (verified in Chrome, 2026-11-03: the same player autoplayed when the canvas
// was frozen and failed when it was animating). `paused` freezes the rain on
// its last painted frame and stops scheduling work.

let queue: FrameRequestCallback[] = []
const clearRect = vi.fn()

function runFrame(time = 1000) {
  const pending = queue
  queue = []
  pending.forEach((cb) => cb(time))
}

beforeEach(() => {
  queue = []
  clearRect.mockClear()
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    queue.push(cb)
    return queue.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  // jsdom has no 2D canvas; give the component a no-op context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect,
    fillText: vi.fn(),
    font: '',
    fillStyle: '',
    globalAlpha: 1,
  } as unknown as RenderingContext)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MatrixRainBackground', () => {
  it('keeps scheduling frames by default', () => {
    render(<MatrixRainBackground />)
    runFrame()
    expect(queue).toHaveLength(1)
  })

  it('marks its canvas fill-hide so fill mode can hide it', () => {
    const { container } = render(<MatrixRainBackground />)
    expect(container.querySelector('canvas')).toHaveClass('fill-hide')
  })

  it('stops scheduling frames and keeps its last frame while paused, then resumes', () => {
    const { rerender } = render(<MatrixRainBackground paused />)
    runFrame()
    // Frozen: nothing scheduled, and the canvas was not cleared/blanked.
    expect(queue).toHaveLength(0)
    expect(clearRect).not.toHaveBeenCalled()

    rerender(<MatrixRainBackground paused={false} />)
    expect(queue).toHaveLength(1)
  })
})
