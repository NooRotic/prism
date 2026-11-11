import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../../../config/storageKeys'
import { FloatingVideoContext } from '../../chat/floatingVideoContext'
import type { FloatingVideoControls } from '../../chat/floatingVideoContext'
import { useChatPopout } from '../../chat/useChatPopout'
import OfflineLayout from '../OfflineLayout'

vi.mock('../../chat/useChatPopout', () => ({ useChatPopout: vi.fn() }))

const popoutOpen = vi.fn()
const popoutClose = vi.fn()
const chatFrame = () => screen.queryByTitle('streamer Twitch chat')
const root = () => screen.getByTestId('offline-layout')
const rootVar = (name: string) => root().style.getPropertyValue(name)

function layout(player: React.ReactNode | null = null) {
  return (
    <OfflineLayout channel="streamer" strip={<div data-testid="strip">strip</div>} player={player}>
      <div data-testid="body">body</div>
    </OfflineLayout>
  )
}

/** Drags a separator: down at `from`, one move to each of `moves`, up on the last. */
function drag(bar: HTMLElement, axis: 'x' | 'y', from: number, ...moves: number[]) {
  Object.defineProperty(bar, 'setPointerCapture', { value: vi.fn(), configurable: true })
  const fire = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', at: number) => {
    const event = createEvent[type](bar, { button: 0 })
    Object.defineProperty(event, 'clientX', { value: axis === 'x' ? at : 0 })
    Object.defineProperty(event, 'clientY', { value: axis === 'y' ? at : 0 })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    fireEvent(bar, event)
  }
  fire('pointerDown', from)
  moves.forEach((at) => fire('pointerMove', at))
  fire('pointerUp', moves[moves.length - 1] ?? from)
}

describe('OfflineLayout', () => {
  const originalInnerHeight = window.innerHeight

  beforeEach(() => {
    localStorage.clear()
    popoutOpen.mockReset()
    popoutClose.mockReset()
    vi.mocked(useChatPopout).mockReset()
    vi.mocked(useChatPopout).mockReturnValue({ isOpen: false, blocked: false, open: popoutOpen, close: popoutClose })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  it('renders the strip, the chat once and the body, and no player when it is folded', () => {
    render(layout(null))
    expect(screen.getByTestId('strip')).toBeInTheDocument()
    expect(screen.getAllByTitle('streamer Twitch chat')).toHaveLength(1)
    expect(screen.getByTestId('body')).toBeInTheDocument()
    expect(screen.queryByTestId('the-player')).toBeNull()
  })

  it('shows the player when given one, and the chat iframe is the same node before and after', () => {
    const { rerender } = render(layout(null))
    const before = chatFrame()
    rerender(layout(<div data-testid="the-player">player</div>))
    expect(screen.getByTestId('the-player')).toBeInTheDocument()
    expect(chatFrame()).toBe(before)
    rerender(layout(null))
    expect(chatFrame()).toBe(before)
  })

  it('gives the chat header text size, hide and pop out, but no swap-side, grip, Fill, Fullscreen or video control', () => {
    render(layout(null))
    expect(screen.getByRole('button', { name: 'Hide chat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pop out chat' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /text size/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move chat to the/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /fill/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /pop out video/i })).toBeNull()
    expect(screen.getByTestId('chat-header').querySelector('svg.lucide-grip-vertical')).toBeNull()
  })

  it('hides the chat into a restore strip and brings it back', () => {
    render(layout(null))
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
    expect(chatFrame()).toBeNull()
    expect(screen.queryByRole('button', { name: /fill/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /fullscreen/i })).toBeNull()
    expect(rootVar('--offline-chat-width')).toBe('40px')
    expect(screen.queryByRole('separator', { name: 'Resize chat width' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }))
    expect(chatFrame()).not.toBeNull()
  })

  it('shows a way back to the page while the chat is popped out', () => {
    vi.mocked(useChatPopout).mockReturnValue({ isOpen: true, blocked: false, open: popoutOpen, close: popoutClose })
    render(layout(null))
    expect(chatFrame()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Return chat to the page' }))
    expect(popoutClose).toHaveBeenCalledTimes(1)
  })

  it('opens the pop-out from the header button', () => {
    render(layout(null))
    fireEvent.click(screen.getByRole('button', { name: 'Pop out chat' }))
    expect(popoutOpen).toHaveBeenCalledTimes(1)
  })

  describe('the chat width', () => {
    it.each([
      ['nothing stored', null],
      ['a width above the maximum', '9999'],
      ['text', 'abc'],
    ])('is 360px for %s', (_label, stored) => {
      if (stored !== null) localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH, stored)
      render(layout(null))
      expect(rootVar('--offline-chat-width')).toBe('360px')
    })

    it('uses a stored width in range', () => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH, '420')
      render(layout(null))
      expect(rootVar('--offline-chat-width')).toBe('420px')
    })

    it('widens when the handle is dragged left, and remembers it', () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1400)
      render(layout(null))
      drag(screen.getByRole('separator', { name: 'Resize chat width' }), 'x', 500, 440)
      expect(rootVar('--offline-chat-width')).toBe('420px')
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH)).toBe('420')
    })

    it('stops at the limits however far it is dragged', () => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1400)
      render(layout(null))
      drag(screen.getByRole('separator', { name: 'Resize chat width' }), 'x', 900, 100)
      expect(rootVar('--offline-chat-width')).toBe('560px')
      drag(screen.getByRole('separator', { name: 'Resize chat width' }), 'x', 100, 900)
      expect(rootVar('--offline-chat-width')).toBe('280px')
    })
  })

  describe('the chat height in the thin layout', () => {
    const capped = (px: number) => `min(${px}px, calc(100vh - var(--header-height)))`
    const heightBar = () => screen.getByRole('separator', { name: 'Resize chat height' })

    it('starts at 360px and is a finger-sized bar inside the chat panel', () => {
      render(layout(null))
      expect(rootVar('--offline-chat-height')).toBe(capped(360))
      expect(screen.getByTestId('chat-panel')).toContainElement(heightBar())
      expect(heightBar()).toHaveStyle({ height: '24px' })
    })

    it('grows when dragged down and remembers the height under the same key as the floating chat', () => {
      render(layout(null))
      drag(heightBar(), 'y', 300, 400)
      expect(rootVar('--offline-chat-height')).toBe(capped(460))
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)).toBe('460')
    })

    it('never goes below the default, and forgets a height that ends at or below it', () => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT, '500')
      render(layout(null))
      expect(rootVar('--offline-chat-height')).toBe(capped(500))
      drag(heightBar(), 'y', 400, 100)
      expect(rootVar('--offline-chat-height')).toBe(capped(360))
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)).toBeNull()
    })

    it('never grows past the window below the header', () => {
      render(layout(null))
      drag(heightBar(), 'y', 100, 2000)
      expect(rootVar('--offline-chat-height')).toBe(capped(844))
    })
  })

  describe('where the chat column sits and how wide it may be (CSS, checked by class in jsdom)', () => {
    it('caps the column at half the page whatever width was remembered', () => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_OFFLINE_WIDTH, '560')
      render(layout(null))
      expect(root().className).toContain('min(var(--offline-chat-width),50%)')
    })

    it('pins the chat just below the top edge, not under a header that has scrolled away', () => {
      render(layout(null))
      const cell = screen.getByTestId('chat-cell')
      expect(cell.className).toContain('lg:sticky')
      expect(cell.className).toContain('lg:top-4')
      expect(cell.className).not.toContain('top-[var(--header-height)]')
    })
  })

  describe('the floating video control', () => {
    const controls = (over: Partial<FloatingVideoControls> = {}): FloatingVideoControls => ({
      supported: true,
      canOpen: true,
      isFloating: false,
      blocked: false,
      failed: false,
      open: vi.fn(),
      close: vi.fn(),
      ...over,
    })
    const withVideo = (value: FloatingVideoControls, player: React.ReactNode | null) => (
      <FloatingVideoContext.Provider value={value}>{layout(player)}</FloatingVideoContext.Provider>
    )

    it('is not offered while the player is folded', () => {
      render(withVideo(controls(), null))
      expect(screen.queryByRole('button', { name: /pop out video/i })).toBeNull()
    })

    it('is offered once the player is shown, and opens the floating window', () => {
      const value = controls()
      render(withVideo(value, <div data-testid="the-player">player</div>))
      const buttons = screen.getAllByRole('button', { name: 'Pop out video' })
      expect(buttons.length).toBeGreaterThan(0)
      fireEvent.click(buttons[0])
      expect(value.open).toHaveBeenCalledTimes(1)
    })

    it('is offered while the video floats even if the player is folded, so it can always be brought back', () => {
      const value = controls({ isFloating: true, canOpen: false })
      render(withVideo(value, null))
      const buttons = screen.getAllByRole('button', { name: 'Bring video back' })
      fireEvent.click(buttons[0])
      expect(value.close).toHaveBeenCalledTimes(1)
    })

    it('puts a panel where the player would be while the video floats, and mounts no second player', () => {
      const value = controls({ isFloating: true, canOpen: false })
      render(withVideo(value, <div data-testid="the-player">player</div>))
      expect(screen.getByTestId('floating-panel')).toBeInTheDocument()
      expect(screen.queryByTestId('the-player')).toBeNull()
      fireEvent.click(within(screen.getByTestId('floating-panel')).getByRole('button', { name: 'Bring video back' }))
      expect(value.close).toHaveBeenCalledTimes(1)
    })
  })
})
