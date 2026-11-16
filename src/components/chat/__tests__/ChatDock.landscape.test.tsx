import { useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ChatDock from '../ChatDock'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { useLandscapePhone } from '../useLandscapePhone'
import { STORAGE_KEYS } from '../../../config/storageKeys'

vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))
vi.mock('../useLandscapePhone', () => ({ useLandscapePhone: vi.fn() }))

const popout = (overrides: Partial<ReturnType<typeof useChatPopout>> = {}) => ({
  isOpen: false,
  blocked: false,
  open: vi.fn(),
  close: vi.fn(),
  ...overrides,
})

const player = <div>player</div>
const renderDock = (channel: string | undefined = 'streamer', node = player) =>
  render(<ChatDock channel={channel} player={node} />)

const chatFrame = () => screen.queryByTitle('streamer Twitch chat')
const handle = () => screen.getByTestId('landscape-chat-handle')
const handleButton = () => within(handle()).getByRole('button')
const panel = () => screen.getByTestId('chat-panel')

describe('ChatDock in landscape phone mode', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useChatPopout).mockReset()
    vi.mocked(useChatPopout).mockReturnValue(popout())
    vi.mocked(useFullscreen).mockReset()
    vi.mocked(useFullscreen).mockReturnValue({ supported: false, isFullscreen: false, toggle: vi.fn() })
    vi.mocked(useLandscapePhone).mockReset()
    vi.mocked(useLandscapePhone).mockReturnValue(true)
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-fill')
  })

  it('forces data-fill=all in landscape even with fill off', () => {
    renderDock()
    expect(document.documentElement.getAttribute('data-fill')).toBe('all')
  })

  it('removes data-fill again when the phone goes back to portrait', () => {
    const { rerender } = renderDock()
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    rerender(<ChatDock channel="streamer" player={player} />)
    expect(document.documentElement.getAttribute('data-fill')).toBeNull()
  })

  it('starts with the chat mounted but closed', () => {
    renderDock()
    expect(chatFrame()).toBeInTheDocument()
    expect(panel()).toHaveAttribute('aria-hidden', 'true')
    expect(handleButton()).toHaveAccessibleName('Show chat')
    expect(handleButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('the handle opens it and then says Hide chat, aria-expanded true', () => {
    renderDock()
    fireEvent.click(handleButton())
    expect(panel()).not.toHaveAttribute('aria-hidden', 'true')
    expect(handleButton()).toHaveAccessibleName('Hide chat')
    expect(handleButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('the open column width keeps the video at least 400px wide', () => {
    renderDock()
    expect(panel()).toHaveClass('basis-0')
    fireEvent.click(handleButton())
    expect(panel().className).toContain('calc(100%_-_2.75rem_-_400px)')
    expect(panel().className).not.toContain('basis-0')
  })

  it('a swipe on the closed handle does not open it (the screen edge is the OS back gesture)', () => {
    renderDock()
    fireEvent.touchStart(handle(), { touches: [{ clientX: 300, clientY: 0 }] })
    fireEvent.touchEnd(handle(), { changedTouches: [{ clientX: 220, clientY: 4 }] })
    expect(handleButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('a swipe toward the chat edge on the open handle closes it', () => {
    renderDock()
    fireEvent.click(handleButton())
    fireEvent.touchStart(handle(), { touches: [{ clientX: 220, clientY: 0 }] })
    fireEvent.touchEnd(handle(), { changedTouches: [{ clientX: 300, clientY: 4 }] })
    expect(handleButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('Escape leaves the saved fill setting alone in landscape', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, 'true')
    renderDock()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBe('true')
  })

  it('Hide in the chat header closes it', () => {
    renderDock()
    fireEvent.click(handleButton())
    fireEvent.click(within(screen.getByTestId('chat-header')).getByRole('button', { name: 'Hide chat' }))
    expect(handleButton()).toHaveAccessibleName('Show chat')
    expect(panel()).toHaveAttribute('aria-hidden', 'true')
  })

  it('offers no docking, resizing or fill controls in this mode', () => {
    renderDock()
    fireEvent.click(handleButton())
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Move chat/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fill/i })).not.toBeInTheDocument()
  })

  it('never writes the saved placement or fill setting', () => {
    const placement = JSON.stringify({ side: 'right', hidden: false })
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT, placement)
    renderDock()
    fireEvent.click(handleButton())
    fireEvent.click(handleButton())
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT)).toBe(placement)
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_FILL_MODE)).toBeNull()
  })

  it('opens even when the saved placement says hidden', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT, JSON.stringify({ side: 'right', hidden: true }))
    renderDock()
    fireEvent.click(handleButton())
    expect(panel()).not.toHaveAttribute('aria-hidden', 'true')
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT)!).hidden).toBe(true)
  })

  it('the handle and chat panel are siblings of chat-player, not inside it', () => {
    renderDock()
    const dock = screen.getByTestId('chat-dock')
    const video = screen.getByTestId('chat-player')
    expect(video.contains(handle())).toBe(false)
    expect(video.contains(panel())).toBe(false)
    expect(handle().parentElement).toBe(dock)
    expect(panel().parentElement).toBe(dock)
  })

  it('lays the row out sideways at every width', () => {
    renderDock()
    const dock = screen.getByTestId('chat-dock')
    expect(dock).toHaveClass('flex-row')
    expect(dock).not.toHaveClass('flex-col')
  })

  it('mirrors the row for a chat saved on the left', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT, JSON.stringify({ side: 'left', hidden: false }))
    renderDock()
    expect(screen.getByTestId('chat-dock')).toHaveClass('flex-row-reverse')
  })

  it('does not remount the player when the phone rotates', () => {
    const mounts = vi.fn()
    function Probe() {
      useEffect(() => mounts(), [])
      return <div>probe</div>
    }
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    const { rerender } = renderDock('streamer', <Probe />)
    vi.mocked(useLandscapePhone).mockReturnValue(true)
    rerender(<ChatDock channel="streamer" player={<Probe />} />)
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    rerender(<ChatDock channel="streamer" player={<Probe />} />)
    expect(mounts).toHaveBeenCalledTimes(1)
  })

  it('with the chat popped out the handle says Return chat to the page and calls popout.close', () => {
    const state = popout({ isOpen: true })
    vi.mocked(useChatPopout).mockReturnValue(state)
    renderDock()
    expect(handleButton()).toHaveAccessibleName('Return chat to the page')
    expect(panel()).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(handleButton())
    expect(state.close).toHaveBeenCalledTimes(1)
  })

  it('with no channel it shows No channel and the handle still toggles', () => {
    // Not renderDock(undefined): that would fall back to the helper's default channel.
    render(<ChatDock channel={undefined} player={player} />)
    fireEvent.click(handleButton())
    expect(screen.getByText('No channel')).toBeInTheDocument()
    expect(handleButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('is today\'s layout when the phone is not sideways', () => {
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    renderDock()
    expect(screen.getByTestId('chat-dock')).toHaveClass('md:flex-row')
    expect(screen.queryByTestId('landscape-chat-handle')).not.toBeInTheDocument()
    expect(chatFrame()).toBeInTheDocument()
  })
})
