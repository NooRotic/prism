import { createEvent, fireEvent, render, screen, within } from '@testing-library/react'
import ChatDock from '../ChatDock'
import { FloatingVideoContext } from '../floatingVideoContext'
import type { FloatingVideoControls } from '../floatingVideoContext'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { STORAGE_KEYS } from '../../../config/storageKeys'

// As in ChatDock.test.tsx, the pop-out's and fullscreen's own behaviour is covered in
// their hook tests; here the dock is checked for how it reacts to the floating video.
vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))

const FLOATING_TEXT = 'The video is in a floating window'
const NOTICE_TEXT = "Couldn't open the floating window. Click the button again."
const FAILED_TEXT =
  "The video couldn't start in the floating window, so it was closed. Click the button to try again."

const controls = (overrides: Partial<FloatingVideoControls> = {}): FloatingVideoControls => ({
  supported: true,
  canOpen: false,
  isFloating: false,
  blocked: false,
  failed: false,
  open: vi.fn(),
  close: vi.fn(),
  ...overrides,
})

const player = <div>player</div>
const dock = (value: FloatingVideoControls) => (
  <FloatingVideoContext.Provider value={value}>
    <ChatDock channel="streamer" player={player} />
  </FloatingVideoContext.Provider>
)
const renderDock = (value: FloatingVideoControls) => render(dock(value))

const chatFrame = () => screen.queryByTitle('streamer Twitch chat')
const hideChat = () =>
  localStorage.setItem(
    STORAGE_KEYS.LOCAL_CHAT_PLACEMENT,
    JSON.stringify({ side: 'right', hidden: true }),
  )

describe('ChatDock with a floating video', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useChatPopout).mockReset()
    vi.mocked(useChatPopout).mockReturnValue({
      isOpen: false,
      blocked: false,
      open: vi.fn(),
      close: vi.fn(),
    })
    vi.mocked(useFullscreen).mockReset()
    vi.mocked(useFullscreen).mockReturnValue({ supported: false, isFullscreen: false, toggle: vi.fn() })
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-fill')
    vi.restoreAllMocks()
  })

  it('offers Pop out video when it can be opened, and leaves the player in place', () => {
    const value = controls({ canOpen: true })
    renderDock(value)

    const buttons = screen.getAllByRole('button', { name: 'Pop out video' })
    buttons.forEach((button) => fireEvent.click(button))
    expect(value.open).toHaveBeenCalledTimes(buttons.length)
    expect(screen.getByText('player')).toBeInTheDocument()
  })

  it('offers no video control when it cannot be opened and is not floating', () => {
    renderDock(controls({ canOpen: false }))

    expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Bring video back' })).not.toBeInTheDocument()
  })

  it('never puts the video control or the notice inside the player wrapper', () => {
    renderDock(controls({ canOpen: true, blocked: true }))

    const wrapper = screen.getByTestId('chat-player')
    screen
      .getAllByRole('button', { name: 'Pop out video' })
      .forEach((button) => expect(wrapper).not.toContainElement(button))
    expect(wrapper).not.toContainElement(screen.getByText(NOTICE_TEXT))
  })

  it('shows a notice above the row when the browser refused, never over the player', () => {
    renderDock(controls({ canOpen: true, blocked: true }))

    const notice = screen.getByText(NOTICE_TEXT)
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('chat-dock')).not.toContainElement(notice)
  })

  it('shows a notice above the row when the video could not start in the window it opened', () => {
    renderDock(controls({ canOpen: true, failed: true }))

    const notice = screen.getByText(FAILED_TEXT)
    expect(notice).toHaveAttribute('role', 'status')
    expect(screen.getByTestId('chat-dock')).not.toContainElement(notice)
    expect(screen.queryByText(NOTICE_TEXT)).not.toBeInTheDocument()
  })

  describe('while floating, with the chat docked', () => {
    it('removes the player, keeps the chat, and lets the chat fill the row', () => {
      renderDock(controls({ isFloating: true }))

      expect(screen.queryByText('player')).not.toBeInTheDocument()
      expect(chatFrame()).toBeInTheDocument()
      expect(screen.getByTestId('chat-player')).toHaveClass('max-md:hidden', 'md:invisible')
      expect(screen.getByTestId('chat-panel')).toHaveClass('md:absolute', 'md:inset-0')
      expect(screen.getByTestId('chat-dock')).toHaveClass('relative')
    })

    it('offers Bring video back in the header and the slim bar', () => {
      const value = controls({ isFloating: true })
      renderDock(value)

      const buttons = screen.getAllByRole('button', { name: 'Bring video back' })
      expect(buttons).toHaveLength(2)
      buttons.forEach((button) => fireEvent.click(button))
      expect(value.close).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('button', { name: 'Pop out video' })).not.toBeInTheDocument()
    })

    it('drops the side swap, the drag hint and the side-by-side resize handle', () => {
      renderDock(controls({ isFloating: true }))

      expect(screen.queryByRole('button', { name: /Move chat to the/ })).not.toBeInTheDocument()
      expect(screen.queryByTitle('Drag to dock the chat on the other side')).not.toBeInTheDocument()
      // The vertical separator is the split between video and chat; the chat-height bar
      // is a horizontal one and is covered below.
      const vertical = screen
        .queryAllByRole('separator')
        .filter((el) => el.getAttribute('aria-orientation') === 'vertical')
      expect(vertical).toHaveLength(0)
    })

    it('does not reload the chat when the video floats or comes back', () => {
      const view = renderDock(controls())
      const panel = screen.getByTestId('chat-panel')
      const frame = chatFrame()

      view.rerender(dock(controls({ isFloating: true })))
      expect(screen.getByTestId('chat-panel')).toBe(panel)
      expect(chatFrame()).toBe(frame)

      view.rerender(dock(controls()))
      expect(screen.getByTestId('chat-panel')).toBe(panel)
      expect(chatFrame()).toBe(frame)
      expect(frame).toBeInTheDocument()
    })

    it('leaves a row that fill mode already fixes alone', () => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, 'true')
      renderDock(controls({ isFloating: true }))

      const row = screen.getByTestId('chat-dock')
      expect(row).toHaveClass('md:fixed')
      expect(row).not.toHaveClass('relative')
    })
  })

  describe('resizing the chat while floating', () => {
    const HEIGHT_VAR = '--chat-floating-height'
    const originalInnerHeight = window.innerHeight
    const heightBar = () => screen.getByRole('separator', { name: 'Resize chat height' })
    const queryHeightBar = () => screen.queryByRole('separator', { name: 'Resize chat height' })
    const rowVar = () => screen.getByTestId('chat-dock').style.getPropertyValue(HEIGHT_VAR)
    const capped = (px: number) => `min(${px}px, calc(100vh - var(--header-height)))`

    // jsdom has no layout, so the row's height is whatever the test says it is.
    const rowIsHigh = (px: number) =>
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(px)

    // Drags the bar: down on `from`, one move to each of `moves`, up on the last.
    const drag = (bar: HTMLElement, from: number, ...moves: number[]) => {
      Object.defineProperty(bar, 'setPointerCapture', { value: vi.fn(), configurable: true })
      const fire = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientY: number) => {
        const event = createEvent[type](bar, { button: 0 })
        Object.defineProperty(event, 'clientX', { value: 100 })
        Object.defineProperty(event, 'clientY', { value: clientY })
        Object.defineProperty(event, 'pointerId', { value: 1 })
        fireEvent(bar, event)
      }
      fire('pointerDown', from)
      moves.forEach((y) => fire('pointerMove', y))
      fire('pointerUp', moves[moves.length - 1] ?? from)
    }

    beforeEach(() => {
      Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true })
    })
    afterEach(() => {
      Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
    })

    it('puts a horizontal Resize chat height bar inside the chat, along its bottom edge', () => {
      renderDock(controls({ isFloating: true }))

      const bar = heightBar()
      expect(bar).toHaveAttribute('aria-orientation', 'horizontal')
      expect(screen.getByTestId('chat-panel')).toContainElement(bar)
      // Last in the panel, under the chat itself.
      expect(screen.getByTestId('chat-panel').lastElementChild).toContainElement(bar)
    })

    it('offers no bar while the video is on the page', () => {
      renderDock(controls())
      expect(queryHeightBar()).not.toBeInTheDocument()
    })

    it('offers no bar when there is no chat beside the video', () => {
      hideChat()
      renderDock(controls({ isFloating: true }))
      expect(queryHeightBar()).not.toBeInTheDocument()
    })

    it('offers no bar in fill mode, where the chat already fills the window', () => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, 'true')
      renderDock(controls({ isFloating: true }))
      expect(queryHeightBar()).not.toBeInTheDocument()
    })

    it('shows it at md and up only', () => {
      renderDock(controls({ isFloating: true }))
      expect(heightBar().parentElement).toHaveClass('hidden', 'md:flex')
    })

    it('makes the chat taller when the bar is dragged down, and remembers the height', () => {
      rowIsHigh(400)
      renderDock(controls({ isFloating: true }))
      expect(rowVar()).toBe('')

      drag(heightBar(), 500, 600)

      expect(rowVar()).toBe(capped(500))
      expect(screen.getByTestId('chat-dock')).toHaveClass('md:min-h-(--chat-floating-height)')
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)).toBe('500')
    })

    it('adds up a drag made of several moves', () => {
      rowIsHigh(400)
      renderDock(controls({ isFloating: true }))

      drag(heightBar(), 500, 540, 580)

      expect(rowVar()).toBe(capped(480))
    })

    it('goes back to the default height when dragged up to the video height or above', () => {
      rowIsHigh(400)
      localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT, '500')
      renderDock(controls({ isFloating: true }))
      expect(rowVar()).toBe(capped(500))

      drag(heightBar(), 500, 350)

      expect(rowVar()).toBe('')
      expect(screen.getByTestId('chat-dock')).not.toHaveClass('md:min-h-(--chat-floating-height)')
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)).toBeNull()
    })

    it('stops growing where the window ends, below the header', () => {
      rowIsHigh(400)
      renderDock(controls({ isFloating: true }))

      drag(heightBar(), 500, 1500)

      // 900 (window) - 56 (header)
      expect(rowVar()).toBe(capped(844))
    })

    it('uses the remembered height when the video floats, and drops it when the video returns', () => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT, '540')
      const view = renderDock(controls())
      expect(rowVar()).toBe('')

      view.rerender(dock(controls({ isFloating: true })))
      expect(rowVar()).toBe(capped(540))

      view.rerender(dock(controls()))
      expect(rowVar()).toBe('')
      expect(screen.getByTestId('chat-dock')).not.toHaveClass('md:min-h-(--chat-floating-height)')
      // Still remembered for the next time.
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_FLOAT_HEIGHT)).toBe('540')
    })

    it('does not reload the chat while it is resized', () => {
      rowIsHigh(400)
      renderDock(controls({ isFloating: true }))
      const frame = chatFrame()

      drag(heightBar(), 500, 600)

      expect(chatFrame()).toBe(frame)
    })

    it('does not throw when saving the height fails', () => {
      rowIsHigh(400)
      renderDock(controls({ isFloating: true }))
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })

      expect(() => drag(heightBar(), 500, 600)).not.toThrow()
      expect(rowVar()).toBe(capped(500))
    })
  })

  describe('while floating, with no chat beside the video', () => {
    it('shows the panel where the video was when the chat is hidden, and both buttons bring it back', () => {
      hideChat()
      const value = controls({ isFloating: true })
      renderDock(value)

      const wrapper = screen.getByTestId('chat-player')
      expect(within(wrapper).getByText(FLOATING_TEXT)).toBeInTheDocument()
      expect(wrapper).not.toHaveClass('md:invisible')
      expect(wrapper).not.toHaveClass('max-md:hidden')
      const buttons = screen.getAllByRole('button', { name: 'Bring video back' })
      expect(buttons).toHaveLength(2)
      buttons.forEach((button) => fireEvent.click(button))
      expect(value.close).toHaveBeenCalledTimes(2)
    })

    it('shows the same panel when the chat is popped out', () => {
      vi.mocked(useChatPopout).mockReturnValue({
        isOpen: true,
        blocked: false,
        open: vi.fn(),
        close: vi.fn(),
      })
      renderDock(controls({ isFloating: true }))

      expect(within(screen.getByTestId('chat-player')).getByText(FLOATING_TEXT)).toBeInTheDocument()
    })

    it('offers Pop out video in the strip when the chat is hidden and it can be opened', () => {
      hideChat()
      renderDock(controls({ canOpen: true }))

      expect(
        within(screen.getByTestId('chat-strip')).getByRole('button', { name: 'Pop out video' }),
      ).toBeInTheDocument()
      expect(screen.getByText('player')).toBeInTheDocument()
    })
  })
})
