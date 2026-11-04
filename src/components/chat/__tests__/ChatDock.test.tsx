import { createEvent, render, screen, fireEvent } from '@testing-library/react'
import ChatDock from '../ChatDock'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { STORAGE_KEYS } from '../../../config/storageKeys'

// The pop-out's and fullscreen's own behaviour is covered in their hook tests; here
// the dock is only checked for how it reacts to what the hooks report.
vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))

const fullscreenState = (overrides: Partial<ReturnType<typeof useFullscreen>> = {}) => ({
  supported: false,
  isFullscreen: false,
  toggle: vi.fn(),
  ...overrides,
})

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
    vi.mocked(useFullscreen).mockReset()
    vi.mocked(useFullscreen).mockReturnValue(fullscreenState())
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-fill')
    vi.restoreAllMocks()
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

  describe('fill mode', () => {
    const remember = (fill = true) => localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, String(fill))
    const rootFill = () => document.documentElement.getAttribute('data-fill')

    it('sets data-fill="md" on the page root when fill is remembered and chat is docked', () => {
      remember()
      renderDock()
      expect(rootFill()).toBe('md')
    })

    it('sets data-fill="all" when fill is remembered and chat is hidden', () => {
      remember()
      localStorage.setItem(
        STORAGE_KEYS.LOCAL_CHAT_PLACEMENT,
        JSON.stringify({ side: 'right', hidden: true }),
      )
      renderDock()
      expect(rootFill()).toBe('all')
    })

    it('sets data-fill="all" when fill is remembered and chat is popped out', () => {
      remember()
      vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: true }))
      renderDock()
      expect(rootFill()).toBe('all')
    })

    const setPlacement = (hidden: boolean, side: 'left' | 'right' = 'right') =>
      localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT, JSON.stringify({ side, hidden }))

    it('the header offers Fill window, and clicking it turns fill on and remembers it', () => {
      renderDock()
      fireEvent.click(screen.getByRole('button', { name: 'Fill window' }))

      expect(screen.getByRole('button', { name: 'Exit fill mode' })).toBeInTheDocument()
      expect(rootFill()).toBe('md')
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBe('true')
    })

    it('the header fill button reflects the state with aria-pressed', () => {
      renderDock()
      const button = screen.getByRole('button', { name: 'Fill window' })
      expect(button).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(button)

      expect(screen.getByRole('button', { name: 'Exit fill mode' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('shows the restore, fill and fullscreen buttons in the strip when chat is hidden', () => {
      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ supported: true }))
      setPlacement(true)
      renderDock()

      expect(screen.getByRole('button', { name: 'Show chat' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fill window' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fullscreen chat and video' })).toBeInTheDocument()
    })

    it('shows the return, fill and fullscreen buttons in the strip when chat is popped out', () => {
      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ supported: true }))
      vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: true }))
      renderDock()

      expect(screen.getByRole('button', { name: 'Return chat to the page' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fill window' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fullscreen chat and video' })).toBeInTheDocument()
    })

    it('has a visible exit-fill button with chat docked, hidden and popped out', () => {
      remember()

      const docked = renderDock()
      expect(screen.getByRole('button', { name: 'Exit fill mode' })).toBeInTheDocument()
      docked.unmount()

      setPlacement(true)
      const hidden = renderDock()
      expect(screen.getByRole('button', { name: 'Exit fill mode' })).toBeInTheDocument()
      hidden.unmount()

      setPlacement(false)
      vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: true }))
      renderDock()
      expect(screen.getByRole('button', { name: 'Exit fill mode' })).toBeInTheDocument()
    })

    it('exiting from the strip works with chat hidden', () => {
      remember()
      setPlacement(true)
      renderDock()

      fireEvent.click(screen.getByRole('button', { name: 'Exit fill mode' }))

      expect(rootFill()).toBeNull()
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBe('false')
    })

    it('keeps the same button element, and its focus, after it is clicked', () => {
      renderDock()
      const button = screen.getByRole('button', { name: 'Fill window' })
      button.focus()

      fireEvent.click(button)

      const after = screen.getByRole('button', { name: 'Exit fill mode' })
      expect(after).toBe(button)
      expect(document.activeElement).toBe(button)
    })

    it('keeps the same strip button, and its focus, after it is clicked', () => {
      setPlacement(true)
      renderDock()
      const button = screen.getByRole('button', { name: 'Fill window' })
      button.focus()

      fireEvent.click(button)

      const after = screen.getByRole('button', { name: 'Exit fill mode' })
      expect(after).toBe(button)
      expect(document.activeElement).toBe(button)
    })

    it('has no fullscreen button when the browser cannot do fullscreen', () => {
      renderDock()
      expect(screen.queryByRole('button', { name: /fullscreen/i })).not.toBeInTheDocument()
    })

    it('the fullscreen button calls the hook, and reflects the state with aria-pressed', () => {
      const toggle = vi.fn()
      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ supported: true, toggle }))
      const { rerender } = renderDock()
      const button = screen.getByRole('button', { name: 'Fullscreen chat and video' })
      expect(button).toHaveAttribute('aria-pressed', 'false')

      fireEvent.click(button)
      expect(toggle).toHaveBeenCalledOnce()

      vi.mocked(useFullscreen).mockReturnValue(
        fullscreenState({ supported: true, isFullscreen: true, toggle }),
      )
      rerender(<ChatDock channel="streamer" player={player} />)
      expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toHaveAttribute('aria-pressed', 'true')
    })

    // Moving an iframe in the DOM reloads it, which restarts the stream and makes
    // Twitch decide autoplay again. Flipping modes must only change classes.
    it('keeps the very same player element when fill is flipped on and off', () => {
      renderDock()
      const player0 = screen.getByText('player')
      const wrapper0 = screen.getByTestId('chat-player')

      fireEvent.click(screen.getByRole('button', { name: 'Fill window' }))
      expect(screen.getByText('player')).toBe(player0)
      expect(screen.getByTestId('chat-player')).toBe(wrapper0)

      fireEvent.click(screen.getByRole('button', { name: 'Exit fill mode' }))
      expect(screen.getByText('player')).toBe(player0)
      expect(screen.getByTestId('chat-player')).toBe(wrapper0)
    })

    it('keeps the very same player element when the chat is hidden and fill is flipped', () => {
      renderDock()
      const player0 = screen.getByText('player')

      fireEvent.click(screen.getByRole('button', { name: 'Fill window' }))
      fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
      fireEvent.click(screen.getByRole('button', { name: 'Exit fill mode' }))

      expect(screen.getByText('player')).toBe(player0)
    })

    it('Escape turns fill off', () => {
      remember()
      renderDock()

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(rootFill()).toBeNull()
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBe('false')
    })

    it('ignores Escape while something is fullscreen, since the browser uses it to leave', () => {
      remember()
      renderDock()
      Object.defineProperty(document, 'fullscreenElement', {
        configurable: true,
        get: () => document.body,
      })

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(rootFill()).toBe('md')
      Reflect.deleteProperty(document, 'fullscreenElement')
    })

    it('ignores other keys', () => {
      remember()
      renderDock()
      fireEvent.keyDown(window, { key: 'Enter' })
      expect(rootFill()).toBe('md')
    })

    it('does nothing on Escape when fill is off', () => {
      renderDock()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBeNull()
    })

    it('stops listening for Escape once it is unmounted', () => {
      remember()
      const { unmount } = renderDock()
      unmount()

      fireEvent.keyDown(window, { key: 'Escape' })

      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBe('true')
    })

    it('hands the dock row to the fullscreen hook', () => {
      renderDock()
      const ref = vi.mocked(useFullscreen).mock.calls[0][0]
      expect(ref.current).toBe(screen.getByTestId('chat-dock'))
    })

    it('uses the fill layout and data-fill while fullscreen, even when fill is off', () => {
      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ isFullscreen: true }))
      renderDock()
      expect(rootFill()).toBe('md')
      expect(screen.getByTestId('chat-dock')).toHaveClass('md:fixed', 'md:inset-0')
    })

    it('does not write the remembered fill setting while fullscreen', () => {
      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ isFullscreen: true }))
      renderDock()
      expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBeNull()
    })

    it('gives data-fill="all" when fullscreen with chat hidden, and the video alone fills', () => {
      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ isFullscreen: true }))
      localStorage.setItem(
        STORAGE_KEYS.LOCAL_CHAT_PLACEMENT,
        JSON.stringify({ side: 'right', hidden: true }),
      )
      renderDock()
      expect(rootFill()).toBe('all')
      expect(screen.getByTestId('chat-dock')).toHaveClass('fixed', 'inset-0')
    })

    it('goes back to the layout it started in when fullscreen ends', () => {
      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ isFullscreen: true }))
      const { rerender } = renderDock()
      expect(rootFill()).toBe('md')

      vi.mocked(useFullscreen).mockReturnValue(fullscreenState({ isFullscreen: false }))
      rerender(<ChatDock channel="streamer" player={player} />)

      expect(rootFill()).toBeNull()
      expect(screen.getByTestId('chat-dock')).not.toHaveClass('md:fixed')
    })

    it('sets no data-fill when fill is off', () => {
      renderDock()
      expect(rootFill()).toBeNull()
    })

    it('treats a garbage saved fill value as off', () => {
      localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, 'banana')
      renderDock()
      expect(rootFill()).toBeNull()
    })

    it('removes data-fill when the dock unmounts, so other pages are untouched', () => {
      remember()
      const { unmount } = renderDock()
      expect(rootFill()).toBe('md')

      unmount()

      expect(rootFill()).toBeNull()
    })

    it('gives the row md-only fill classes when chat is docked', () => {
      remember()
      renderDock()
      const row = screen.getByTestId('chat-dock')
      expect(row).toHaveClass('md:fixed', 'md:inset-0', 'md:z-50')
      expect(row).not.toHaveClass('fixed')
    })

    it('gives the row all-width fill classes when chat is not docked', () => {
      remember()
      vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: true }))
      renderDock()
      const row = screen.getByTestId('chat-dock')
      expect(row).toHaveClass('fixed', 'inset-0', 'z-50')
      expect(row).not.toHaveClass('max-w-[1600px]')
    })

    it('has no fill classes when fill is off', () => {
      renderDock()
      const row = screen.getByTestId('chat-dock')
      expect(row).not.toHaveClass('fixed')
      expect(row).not.toHaveClass('md:fixed')
      expect(row).toHaveClass('max-w-[1600px]')
    })

    it('keeps the 16:9 box below md while chat is docked, and drops it at md and wider', () => {
      remember()
      renderDock()
      const wrapper = screen.getByTestId('chat-player')
      expect(wrapper).toHaveClass('aspect-video', 'md:aspect-auto')
    })

    it('drops the 16:9 box at every width when chat is not docked', () => {
      remember()
      vi.mocked(useChatPopout).mockReturnValue(popout({ isOpen: true }))
      renderDock()
      const wrapper = screen.getByTestId('chat-player')
      expect(wrapper).toHaveClass('aspect-auto')
      expect(wrapper).not.toHaveClass('aspect-video')
    })

    it('keeps the 16:9 box when fill is off', () => {
      renderDock()
      const wrapper = screen.getByTestId('chat-player')
      expect(wrapper).toHaveClass('aspect-video')
      expect(wrapper).not.toHaveClass('md:aspect-auto')
    })

    it('puts nothing from the dock inside the player wrapper in fill mode', () => {
      remember()
      renderDock()
      const wrapper = screen.getByTestId('chat-player')
      expect(wrapper).toContainElement(screen.getByText('player'))
      expect(wrapper).not.toContainElement(screen.getByTestId('chat-panel'))
    })

    it('puts no transition or animation on the row or the player wrapper', () => {
      for (const on of [false, true]) {
        localStorage.clear()
        remember(on)
        const { unmount } = renderDock()
        expect(screen.getByTestId('chat-dock').className).not.toMatch(/transition|animate/)
        expect(screen.getByTestId('chat-player').className).not.toMatch(/transition|animate/)
        unmount()
      }
    })

    // 80% player + the 8px handle + 20% chat is 8px more than the row. In a row that
    // fills the window that clips the chat's right edge off-screen, so the chat
    // shrinks by the handle's width instead.
    it('lets the chat panel shrink so the handle never pushes it past the window edge', () => {
      renderDock()
      expect(screen.getByTestId('chat-panel')).toHaveStyle({ flexShrink: '1' })
    })

    it('does not throw when saving the split ratio fails', () => {
      renderDock()
      const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new DOMException('QuotaExceededError')
      })

      expect(() => fireEvent.pointerUp(screen.getByRole('separator'))).not.toThrow()

      spy.mockRestore()
    })
  })

  it('keeps the Show chat tab visible at every width, so a hidden chat can always be restored', () => {
    renderDock()
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }))
    expect(screen.getByRole('button', { name: 'Show chat' })).not.toHaveClass('hidden')
  })
})
