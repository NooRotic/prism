import { act, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { useDockDrag } from '../useDockDrag'
import type { DockSide } from '../chatPlacement'

// jsdom may drop clientX/clientY/pointerId when it lacks a real PointerEvent,
// so set them on the event explicitly.
function pointer(
  type: 'pointerDown' | 'pointerMove' | 'pointerUp' | 'pointerCancel',
  el: Element,
  clientX: number,
  clientY = 100,
) {
  const event = createEvent[type](el, { button: 0 })
  Object.defineProperty(event, 'clientX', { value: clientX })
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  fireEvent(el, event)
}

function Harness({ onDrop }: { onDrop: (side: DockSide) => void }) {
  const { dragging, hoverSide, handleProps } = useDockDrag(onDrop)
  return (
    <div>
      <span data-testid="handle" {...handleProps} />
      <output data-testid="state">{`${dragging}|${hoverSide ?? '-'}`}</output>
    </div>
  )
}

describe('useDockDrag', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
  })

  const setup = () => {
    const onDrop = vi.fn()
    render(<Harness onDrop={onDrop} />)
    return { onDrop, handle: screen.getByTestId('handle'), state: screen.getByTestId('state') }
  }

  it('releasing on the left half calls onDrop with left', () => {
    const { onDrop, handle } = setup()
    pointer('pointerDown', handle, 900)
    pointer('pointerMove', handle, 200)
    pointer('pointerUp', handle, 200)
    expect(onDrop).toHaveBeenCalledExactlyOnceWith('left')
  })

  it('releasing on the right half calls onDrop with right', () => {
    const { onDrop, handle } = setup()
    pointer('pointerDown', handle, 100)
    pointer('pointerMove', handle, 800)
    pointer('pointerUp', handle, 800)
    expect(onDrop).toHaveBeenCalledExactlyOnceWith('right')
  })

  it('dragging and hoverSide follow the pointer, and clear on release', () => {
    const { handle, state } = setup()
    expect(state).toHaveTextContent('false|-')

    pointer('pointerDown', handle, 900)
    expect(state).toHaveTextContent('true|right')

    pointer('pointerMove', handle, 100)
    expect(state).toHaveTextContent('true|left')

    pointer('pointerUp', handle, 100)
    expect(state).toHaveTextContent('false|-')
  })

  it('ignores pointer moves when no drag is in progress', () => {
    const { onDrop, handle, state } = setup()
    pointer('pointerMove', handle, 100)
    pointer('pointerUp', handle, 100)
    expect(state).toHaveTextContent('false|-')
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('pointercancel ends the drag without calling onDrop', () => {
    const { onDrop, handle, state } = setup()
    pointer('pointerDown', handle, 900)
    pointer('pointerMove', handle, 100)
    pointer('pointerCancel', handle, 100)
    expect(state).toHaveTextContent('false|-')

    pointer('pointerUp', handle, 100)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it.each([
    ['left of the window', -5, 100],
    ['right of the window', 1200, 100],
    ['below the window', 500, 900],
    ['above the window', 500, -10],
  ])('releasing %s does not call onDrop', (_label, x, y) => {
    const { onDrop, handle, state } = setup()
    pointer('pointerDown', handle, 900)
    pointer('pointerUp', handle, x, y)
    expect(onDrop).not.toHaveBeenCalled()
    expect(state).toHaveTextContent('false|-')
  })

  it('Escape during the drag cancels it', () => {
    const { onDrop, handle, state } = setup()
    pointer('pointerDown', handle, 900)
    expect(state).toHaveTextContent('true|right')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(state).toHaveTextContent('false|-')

    pointer('pointerUp', handle, 100)
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('still starts the drag when setPointerCapture throws (the pointer is no longer active)', () => {
    const { handle, state } = setup()
    Object.defineProperty(handle, 'setPointerCapture', {
      configurable: true,
      value: () => {
        throw new DOMException('No active pointer with that id', 'NotFoundError')
      },
    })

    pointer('pointerDown', handle, 900)

    expect(state).toHaveTextContent('true|right')
  })

  it('shows a grab cursor and disables browser touch panning on the handle', () => {
    const { handle } = setup()
    expect(handle.style.touchAction).toBe('none')
    expect(handle.style.cursor).toBe('grab')
  })
})
