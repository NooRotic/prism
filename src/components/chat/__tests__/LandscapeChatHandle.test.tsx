import { fireEvent, render, screen } from '@testing-library/react'
import LandscapeChatHandle from '../LandscapeChatHandle'

const touch = (x: number, y = 0) => ({ changedTouches: [{ clientX: x, clientY: y }], touches: [{ clientX: x, clientY: y }] })

function setup(props: Partial<React.ComponentProps<typeof LandscapeChatHandle>> = {}) {
  const onToggle = vi.fn()
  render(
    <LandscapeChatHandle side="right" open={false} label="Show chat" onToggle={onToggle} {...props} />,
  )
  return { onToggle, column: screen.getByTestId('landscape-chat-handle') }
}

describe('LandscapeChatHandle', () => {
  it('exposes the given label on its button', () => {
    setup({ label: 'Return chat to the page' })
    expect(screen.getByRole('button', { name: 'Return chat to the page' })).toBeInTheDocument()
  })

  it('aria-expanded follows open', () => {
    const { rerender } = render(
      <LandscapeChatHandle side="right" open={false} label="Show chat" onToggle={vi.fn()} />,
    )
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
    rerender(<LandscapeChatHandle side="right" open label="Hide chat" onToggle={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  })

  it('a tap toggles once', () => {
    const { onToggle } = setup()
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('is a 44px column', () => {
    const { column } = setup()
    expect(column).toHaveClass('w-11')
  })

  // The closed handle is flush against the screen edge, where Android's and iOS's back
  // gesture starts: a swipe there must never be taken for "open", or the browser goes back
  // and the stream stops. Opening is a tap.
  it('a swipe in the opening direction does nothing while closed', () => {
    const { onToggle, column } = setup()
    fireEvent.touchStart(column, touch(300))
    fireEvent.touchEnd(column, touch(240))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('the same swipe does not toggle while open', () => {
    const { onToggle, column } = setup({ open: true, label: 'Hide chat' })
    fireEvent.touchStart(column, touch(300))
    fireEvent.touchEnd(column, touch(240))
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('a swipe in the closing direction toggles while open', () => {
    const { onToggle, column } = setup({ open: true, label: 'Hide chat' })
    fireEvent.touchStart(column, touch(200))
    fireEvent.touchEnd(column, touch(260))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('a vertical drag does not toggle', () => {
    const { onToggle, column } = setup()
    fireEvent.touchStart(column, touch(300, 0))
    fireEvent.touchEnd(column, touch(290, 90))
    expect(onToggle).not.toHaveBeenCalled()
  })
})
