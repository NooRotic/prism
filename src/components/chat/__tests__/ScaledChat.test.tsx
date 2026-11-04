import { render, screen } from '@testing-library/react'
import ScaledChat from '../ScaledChat'

const inner = () => screen.getByTestId('scaled-chat-inner')

describe('ScaledChat', () => {
  it('renders its children inside the scaled element', () => {
    render(
      <ScaledChat scale={1.5}>
        <iframe title="chat" />
      </ScaledChat>,
    )
    expect(inner()).toContainElement(screen.getByTitle('chat'))
  })

  it('sets the scale as a CSS variable on the scaled element', () => {
    render(
      <ScaledChat scale={1.5}>
        <span>chat</span>
      </ScaledChat>,
    )
    expect(inner().style.getPropertyValue('--chat-scale')).toBe('1.5')
  })

  it('scales from the top left with the box shrunk to 1/scale, from md and wider by default', () => {
    render(
      <ScaledChat scale={1.5}>
        <span>chat</span>
      </ScaledChat>,
    )
    expect(inner()).toHaveClass(
      'md:origin-top-left',
      'md:[transform:scale(var(--chat-scale))]',
      'md:w-[calc(100%/var(--chat-scale))]',
      'md:h-[calc(100%/var(--chat-scale))]',
    )
    expect(inner()).not.toHaveClass('[transform:scale(var(--chat-scale))]')
  })

  it('applies at every width when always is set (the pop-out)', () => {
    render(
      <ScaledChat scale={1.5} always>
        <span>chat</span>
      </ScaledChat>,
    )
    expect(inner()).toHaveClass(
      'origin-top-left',
      '[transform:scale(var(--chat-scale))]',
      'w-[calc(100%/var(--chat-scale))]',
      'h-[calc(100%/var(--chat-scale))]',
    )
    expect(inner()).not.toHaveClass('md:[transform:scale(var(--chat-scale))]')
    expect(inner()).not.toHaveClass('w-full')
  })

  it('adds no transform at the default size, so nothing changes for anyone who never touches it', () => {
    render(
      <ScaledChat scale={1}>
        <span>chat</span>
      </ScaledChat>,
    )
    expect(inner().className).not.toMatch(/transform/)
    expect(inner()).toHaveClass('w-full', 'h-full')
  })

  it('clips to its own box so a scaled chat never spills over its neighbours', () => {
    render(
      <ScaledChat scale={2}>
        <span>chat</span>
      </ScaledChat>,
    )
    expect(screen.getByTestId('scaled-chat')).toHaveClass('overflow-hidden', 'w-full', 'h-full')
  })

  // Moving or recreating an iframe reloads it, which would reload the chat every
  // time the size is nudged.
  it('keeps the very same child element when the size changes', () => {
    const { rerender } = render(
      <ScaledChat scale={1}>
        <iframe title="chat" />
      </ScaledChat>,
    )
    const frame = screen.getByTitle('chat')

    rerender(
      <ScaledChat scale={1.5}>
        <iframe title="chat" />
      </ScaledChat>,
    )
    expect(screen.getByTitle('chat')).toBe(frame)

    rerender(
      <ScaledChat scale={1}>
        <iframe title="chat" />
      </ScaledChat>,
    )
    expect(screen.getByTitle('chat')).toBe(frame)
  })
})
