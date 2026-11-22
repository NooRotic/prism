import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import ChatDock from '../ChatDock'
import { FloatingVideoContext } from '../floatingVideoContext'
import type { FloatingVideoControls } from '../floatingVideoContext'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { STORAGE_KEYS } from '../../../config/storageKeys'

vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))

const HEIGHT_VAR = '--chat-floating-height'
const ROW_HEIGHT_KEY = 'prism_row_height'
const LABEL = 'Resize video and chat height'

const controls = (overrides: Partial<FloatingVideoControls> = {}): FloatingVideoControls => ({
  supported: true,
  canOpen: false,
  isFloating: false,
  blocked: false,
  failed: false,
  open: vi.fn(),
  close: vi.fn(),
  registerSource: vi.fn(),
  ...overrides,
})
const dock = (value: FloatingVideoControls) => (
  <FloatingVideoContext.Provider value={value}>
    <ChatDock channel="streamer" player={<div>player</div>} />
  </FloatingVideoContext.Provider>
)
const renderDock = (value: FloatingVideoControls = controls()) => render(dock(value))

const bar = () => screen.getByRole('separator', { name: LABEL })
const queryBar = () => screen.queryByRole('separator', { name: LABEL })
const rowVar = () => screen.getByTestId('chat-dock').style.getPropertyValue(HEIGHT_VAR)
const capped = (px: number) => `min(${px}px, calc(100vh - var(--header-height)))`
const rowIsHigh = (px: number) => vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(px)

const drag = (el: HTMLElement, from: number, ...moves: number[]) => {
  Object.defineProperty(el, 'setPointerCapture', { value: vi.fn(), configurable: true })
  const fire = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientY: number) => {
    const event = createEvent[type](el, { button: 0 })
    Object.defineProperty(event, 'clientX', { value: 100 })
    Object.defineProperty(event, 'clientY', { value: clientY })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    fireEvent(el, event)
  }
  fire('pointerDown', from)
  moves.forEach((y) => fire('pointerMove', y))
  fire('pointerUp', moves[moves.length - 1] ?? from)
}

const originalInnerHeight = window.innerHeight

describe('ChatDock: one bar under the video and the chat, with both on the page', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useChatPopout).mockReset()
    vi.mocked(useChatPopout).mockReturnValue({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() })
    vi.mocked(useFullscreen).mockReset()
    vi.mocked(useFullscreen).mockReturnValue({ supported: false, isFullscreen: false, toggle: vi.fn() })
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
  })
  afterEach(() => {
    document.documentElement.removeAttribute('data-fill')
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
    vi.restoreAllMocks()
  })

  it('puts a horizontal bar under the whole row (video and chat), not inside the chat', () => {
    renderDock()
    expect(bar()).toHaveAttribute('aria-orientation', 'horizontal')
    const row = screen.getByTestId('chat-dock')
    expect(row).not.toContainElement(bar())
    expect(screen.getByTestId('chat-panel')).not.toContainElement(bar())
    // Right after the row, so it sits under both the video and the chat.
    expect(row.nextElementSibling).toContainElement(bar())
  })

  it('shows it at md and up only', () => {
    renderDock()
    expect(bar().parentElement).toHaveClass('hidden', 'md:flex')
  })

  it('is not there while the video floats (that case has its own bar inside the chat), without chat, or in fill mode', () => {
    const floating = renderDock(controls({ isFloating: true }))
    expect(queryBar()).not.toBeInTheDocument()
    floating.unmount()
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT, JSON.stringify({ side: 'right', hidden: true }))
    const hidden = renderDock()
    expect(queryBar()).not.toBeInTheDocument()
    hidden.unmount()
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, 'true')
    renderDock()
    expect(queryBar()).not.toBeInTheDocument()
  })

  it('makes the whole row taller when dragged down, so the video and the chat both grow, and remembers the height', () => {
    rowIsHigh(400)
    renderDock()
    expect(rowVar()).toBe('')
    drag(bar(), 500, 600)
    expect(rowVar()).toBe(capped(500))
    expect(screen.getByTestId('chat-dock')).toHaveClass('md:min-h-(--chat-floating-height)')
    expect(localStorage.getItem(ROW_HEIGHT_KEY)).toBe('500')
    // The video's box and the chat are both children of that row, so they follow it.
    expect(screen.getByTestId('chat-dock')).toContainElement(screen.getByTestId('chat-player'))
    expect(screen.getByTestId('chat-dock')).toContainElement(screen.getByTestId('chat-panel'))
  })

  it('goes back to the default height when dragged up to it or above', () => {
    rowIsHigh(400)
    localStorage.setItem(ROW_HEIGHT_KEY, '500')
    renderDock()
    expect(rowVar()).toBe(capped(500))
    drag(bar(), 500, 350)
    expect(rowVar()).toBe('')
    expect(screen.getByTestId('chat-dock')).not.toHaveClass('md:min-h-(--chat-floating-height)')
    expect(localStorage.getItem(ROW_HEIGHT_KEY)).toBeNull()
  })

  it('stops growing where the window ends, below the header', () => {
    rowIsHigh(400)
    renderDock()
    drag(bar(), 500, 1500)
    expect(rowVar()).toBe(capped(844))
  })

  it('uses the remembered row height on arrival, and keeps it apart from the floating chat height', () => {
    localStorage.setItem(ROW_HEIGHT_KEY, '520')
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT, '700')
    const view = renderDock()
    expect(rowVar()).toBe(capped(520))
    view.rerender(dock(controls({ isFloating: true })))
    expect(rowVar()).toBe(capped(700))
    view.rerender(dock(controls()))
    expect(rowVar()).toBe(capped(520))
  })

  it('does not reload the chat while the row is resized', () => {
    rowIsHigh(400)
    renderDock()
    const frame = screen.queryByTitle('streamer Twitch chat')
    drag(bar(), 500, 600)
    expect(screen.queryByTitle('streamer Twitch chat')).toBe(frame)
  })

  it('does not throw when saving the height fails', () => {
    rowIsHigh(400)
    renderDock()
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => drag(bar(), 500, 600)).not.toThrow()
    expect(rowVar()).toBe(capped(500))
  })
})
