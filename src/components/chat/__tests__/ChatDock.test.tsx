import { createEvent, render, screen, fireEvent } from '@testing-library/react'
import ChatDock from '../ChatDock'
import { useChatPopout } from '../useChatPopout'
import { STORAGE_KEYS } from '../../../config/storageKeys'

// The pop-out's own behaviour is covered in useChatPopout.test.ts; here the dock
// is only checked for how it reacts to the hook's state.
vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))

const popout = (overrides: Partial<ReturnType<typeof useChatPopout>> = {}) => ({
  isOpen: false,
  blocked: false,
  open: vi.fn(),
  close: vi.fn(),
  ...overrides,
})

const player = <div>player</div>
const renderDock = (channel = 'streamer') =>
  render(<ChatDock channel={channel} player={player} />)

const chatFrame = () => screen.queryByTitle('streamer Twitch chat')

describe('ChatDock', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useChatPopout).mockReset()
    vi.mocked(useChatPopout).mockReturnValue(popout())
  })

  it('docks the chat on the right by default', () => {
    renderDock()
    const dock = screen.getByTestId('chat-dock')
    expect(dock).toHaveClass('md:flex-row')
    expect(dock).not.toHaveClass('md:flex-row-reverse')
    expect(chatFrame()).toBeInTheDocument()
  })

  it('docks the chat on the left after Move chat to the left, and remembers it', () => {
    renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Move chat to the left' }))

    expect(screen.getByTestId('chat-dock')).toHaveClass('md:flex-row-reverse')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT)!).side).toBe('left')
    expect(screen.getByRole('button', { name: 'Move chat to the right' })).toBeInTheDocument()
  })

  it('Hide chat removes the chat iframe and the resize handle and shows a Show chat tab', () => {
    renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))

    expect(chatFrame()).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show chat' })).toBeInTheDocument()
  })

  it('clicking Show chat brings the chat back', () => {
    renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }))

    expect(chatFrame()).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show chat' })).not.toBeInTheDocument()
  })

  it('stays hidden when the channel prop changes', () => {
    const { rerender } = renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))

    rerender(<ChatDock channel="someone-else" player={player} />)

    expect(screen.queryByTitle('someone-else Twitch chat')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show chat' })).toBeInTheDocument()
  })

  it('is still hidden after a reload', () => {
    const first = renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
    first.unmount()

    renderDock()
    expect(chatFrame()).not.toBeInTheDocument()
  })

  it('never puts the chat panel or the Show chat tab inside the player wrapper', () => {
    renderDock()
    const playerWrapper = screen.getByTestId('chat-player')
    expect(playerWrapper).toContainElement(screen.getByText('player'))
    expect(playerWrapper).not.toContainElement(screen.getByTestId('chat-panel'))

    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
    expect(playerWrapper).not.toContainElement(screen.getByRole('button', { name: 'Show chat' }))
  })

  it('gives the player the remaining width while the chat is hidden', () => {
    renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
    expect(screen.getByTestId('chat-player')).toHaveStyle({ flexGrow: '1' })
  })

  it('sizes the player from the stored split ratio while the chat is visible', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_PANEL_RATIO, '0.7')
    renderDock()
    expect(screen.getByTestId('chat-player').style.flexBasis).toBe('70.0%')
  })

  it('shows No channel when there is no channel', () => {
    render(<ChatDock channel={undefined} player={player} />)
    expect(screen.getByText('No channel')).toBeInTheDocument()
  })

  it('hides the placement controls below md', () => {
    renderDock()
    const header = screen.getByTestId('chat-header')
    expect(header).toHaveClass('hidden', 'md:flex')
  })

  it('dragging the chat handle onto the left half docks the chat on the left, and remembers it', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    renderDock()
    const handle = screen.getByTitle('Drag to dock the chat on the other side')

    const fire = (type: 'pointerDown' | 'pointerMove' | 'pointerUp', clientX: number) => {
      const event = createEvent[type](handle, { button: 0 })
      Object.defineProperty(event, 'clientX', { value: clientX })
      Object.defineProperty(event, 'clientY', { value: 100 })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      fireEvent(handle, event)
    }
    fire('pointerDown', 900)
    fire('pointerMove', 100)
    fire('pointerUp', 100)

    expect(screen.getByTestId('chat-dock')).toHaveClass('md:flex-row-reverse')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT)!).side).toBe('left')
  })

  it('hands the channel to the pop-out hook', () => {
    renderDock()
    expect(useChatPopout).toHaveBeenCalledWith('streamer')
  })

  it('the Pop out chat button calls open', () => {
    const p = popout()
    vi.mocked(useChatPopout).mockReturnValue(p)
    renderDock()

    fireEvent.click(screen.getByRole('button', { name: 'Pop out chat' }))

    expect(p.open).toHaveBeenCalledOnce()
  })

  it('while popped out the chat panel is gone and Return chat to the page is shown', () => {
    vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: true }))
    renderDock()

    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument()
    expect(chatFrame()).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    const tab = screen.getByRole('button', { name: 'Return chat to the page' })
    expect(screen.getByTestId('chat-player')).not.toContainElement(tab)
  })

  it('popped out wins over hidden', () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_CHAT_PLACEMENT,
      JSON.stringify({ side: 'right', hidden: true }),
    )
    vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: true }))
    renderDock()

    expect(screen.getByRole('button', { name: 'Return chat to the page' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show chat' })).not.toBeInTheDocument()
  })

  it('returning calls close, and the chat is back on the side it was docked', () => {
    localStorage.setItem(
      STORAGE_KEYS.LOCAL_CHAT_PLACEMENT,
      JSON.stringify({ side: 'left', hidden: false }),
    )
    const p = popout({ isOpen: true })
    vi.mocked(useChatPopout).mockReturnValue(p)
    const { rerender } = renderDock()

    fireEvent.click(screen.getByRole('button', { name: 'Return chat to the page' }))
    expect(p.close).toHaveBeenCalledOnce()

    vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: false }))
    rerender(<ChatDock channel="streamer" player={player} />)

    expect(chatFrame()).toBeInTheDocument()
    expect(screen.getByTestId('chat-dock')).toHaveClass('md:flex-row-reverse')
  })

  it('a blocked popup shows a status message and the chat stays docked', () => {
    vi.mocked(useChatPopout).mockReturnValue(popout({ blocked: true }))
    renderDock()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Pop-up blocked. Allow pop-ups for this site to use the chat window.',
    )
    expect(chatFrame()).toBeInTheDocument()
  })

  it('shows no status message when nothing was blocked', () => {
    renderDock()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps the Show chat tab visible at every width, so a hidden chat can always be restored', () => {
    renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
    expect(screen.getByRole('button', { name: 'Show chat' })).not.toHaveClass('hidden')
  })
})
