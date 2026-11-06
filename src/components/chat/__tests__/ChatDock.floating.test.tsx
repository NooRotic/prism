import { fireEvent, render, screen, within } from '@testing-library/react'
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

const controls = (overrides: Partial<FloatingVideoControls> = {}): FloatingVideoControls => ({
  supported: true,
  canOpen: false,
  isFloating: false,
  blocked: false,
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

    it('drops the side swap, the drag hint and the resize handle', () => {
      renderDock(controls({ isFloating: true }))

      expect(screen.queryByRole('button', { name: /Move chat to the/ })).not.toBeInTheDocument()
      expect(screen.queryByTitle('Drag to dock the chat on the other side')).not.toBeInTheDocument()
      expect(screen.queryByRole('separator')).not.toBeInTheDocument()
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
