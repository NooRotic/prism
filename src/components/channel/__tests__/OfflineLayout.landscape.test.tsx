import { useEffect } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { STORAGE_KEYS } from '../../../config/storageKeys'
import { FloatingVideoContext } from '../../chat/floatingVideoContext'
import type { FloatingVideoControls } from '../../chat/floatingVideoContext'
import { useChatPopout } from '../../chat/useChatPopout'
import { useLandscapePhone } from '../../chat/useLandscapePhone'
import OfflineLayout from '../OfflineLayout'

vi.mock('../../chat/useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../../chat/useLandscapePhone', () => ({ useLandscapePhone: vi.fn() }))

const popoutClose = vi.fn()
const chatFrame = () => screen.queryByTitle('streamer Twitch chat')
const root = () => screen.getByTestId('offline-layout')
const handle = () => screen.getByTestId('landscape-chat-handle')
const handleButton = () => handle().querySelector('button') as HTMLButtonElement
const cell = () => screen.getByTestId('chat-cell')
const fillAttr = () => document.documentElement.getAttribute('data-fill')
const stored = () =>
  JSON.stringify(Array.from({ length: localStorage.length }, (_, i) => [localStorage.key(i), localStorage.getItem(localStorage.key(i)!)]))

function layout(player: React.ReactNode | null = <div data-testid="the-player">player</div>) {
  return (
    <OfflineLayout channel="streamer" strip={<div data-testid="strip">strip</div>} player={player}>
      <div data-testid="body">body</div>
    </OfflineLayout>
  )
}

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

describe('OfflineLayout in landscape phone mode', () => {
  beforeEach(() => {
    localStorage.clear()
    popoutClose.mockReset()
    vi.mocked(useChatPopout).mockReset()
    vi.mocked(useChatPopout).mockReturnValue({ isOpen: false, blocked: false, open: vi.fn(), close: popoutClose })
    vi.mocked(useLandscapePhone).mockReset()
    vi.mocked(useLandscapePhone).mockReturnValue(true)
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-fill')
  })

  it("is today's grid when the phone is not sideways", () => {
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    render(layout())
    expect(root()).toHaveClass('grid')
    expect(screen.queryByTestId('landscape-chat-handle')).toBeNull()
    expect(fillAttr()).toBeNull()
  })

  it("is today's grid when sideways but the player is folded", () => {
    render(layout(null))
    expect(root()).toHaveClass('grid')
    expect(screen.queryByTestId('landscape-chat-handle')).toBeNull()
    expect(fillAttr()).toBeNull()
  })

  it('forces data-fill=all when sideways with a player', () => {
    render(layout())
    expect(fillAttr()).toBe('all')
  })

  it('removes data-fill when the phone goes back to portrait', () => {
    const { rerender } = render(layout())
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    rerender(layout())
    expect(fillAttr()).toBeNull()
  })

  it('the root is a fixed full-window row, with the strip and body hidden but mounted', () => {
    render(layout())
    expect(root()).toHaveClass('fixed', 'inset-0', 'flex-row')
    expect(root()).not.toHaveClass('grid')
    expect(screen.getByTestId('strip').parentElement).toHaveClass('hidden')
    expect(screen.getByTestId('body').parentElement).toHaveClass('hidden')
  })

  it('the player wrapper fills the row and is not 16:9', () => {
    render(layout())
    const player = screen.getByTestId('offline-player')
    expect(player).toHaveClass('flex-1')
    expect(player).not.toHaveClass('aspect-video')
    expect(player).not.toHaveClass('min-h-[300px]')
  })

  it('starts with the chat closed and the handle saying Show chat', () => {
    render(layout())
    expect(chatFrame()).toBeInTheDocument()
    expect(cell()).toHaveAttribute('aria-hidden', 'true')
    expect(handleButton()).toHaveAccessibleName('Show chat')
    expect(handleButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('the handle opens it and the width keeps the video at least 400px wide', () => {
    render(layout())
    fireEvent.click(handleButton())
    expect(cell()).not.toHaveAttribute('aria-hidden', 'true')
    expect(handleButton()).toHaveAccessibleName('Hide chat')
    expect(cell().className).toContain('calc(100%_-_2.75rem_-_400px)')
  })

  it('opens even when the saved placement says hidden, and leaves the saved value alone', () => {
    const placement = JSON.stringify({ side: 'right', hidden: true })
    localStorage.setItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT, placement)
    render(layout())
    expect(chatFrame()).toBeInTheDocument()
    fireEvent.click(handleButton())
    expect(cell()).not.toHaveAttribute('aria-hidden', 'true')
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_CHAT_PLACEMENT)).toBe(placement)
  })

  it('never writes chat placement, fill or the offline chat width/height', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_FILL_MODE, 'true')
    const before = stored()
    render(layout())
    fireEvent.click(handleButton())
    fireEvent.click(handleButton())
    expect(stored()).toBe(before)
  })

  it('a swipe toward the chat edge on the open handle closes it', () => {
    render(layout())
    fireEvent.click(handleButton())
    fireEvent.touchStart(handle(), { touches: [{ clientX: 220, clientY: 0 }] })
    fireEvent.touchEnd(handle(), { changedTouches: [{ clientX: 300, clientY: 4 }] })
    expect(handleButton()).toHaveAttribute('aria-expanded', 'false')
  })

  it('does not remount the player when the phone rotates', () => {
    const mounts = vi.fn()
    function Probe() {
      useEffect(() => mounts(), [])
      return <div>probe</div>
    }
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    const { rerender } = render(layout(<Probe />))
    vi.mocked(useLandscapePhone).mockReturnValue(true)
    rerender(layout(<Probe />))
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    rerender(layout(<Probe />))
    expect(mounts).toHaveBeenCalledTimes(1)
  })

  it('keeps the same chat iframe across a rotation', () => {
    vi.mocked(useLandscapePhone).mockReturnValue(false)
    const { rerender } = render(layout())
    const before = chatFrame()
    vi.mocked(useLandscapePhone).mockReturnValue(true)
    rerender(layout())
    expect(chatFrame()).toBe(before)
  })

  it('with the chat popped out the handle says Return chat to the page and calls popout.close', () => {
    vi.mocked(useChatPopout).mockReturnValue({ isOpen: true, blocked: false, open: vi.fn(), close: popoutClose })
    render(layout())
    expect(handleButton()).toHaveAccessibleName('Return chat to the page')
    expect(cell()).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(handleButton())
    expect(popoutClose).toHaveBeenCalledTimes(1)
  })

  it('with the video floating it keeps the ordinary layout', () => {
    render(
      <FloatingVideoContext.Provider value={controls({ isFloating: true, canOpen: false })}>
        {layout()}
      </FloatingVideoContext.Provider>,
    )
    expect(root()).toHaveClass('grid')
    expect(screen.queryByTestId('landscape-chat-handle')).toBeNull()
    expect(fillAttr()).toBeNull()
  })

  it('offers no width or height resize handles in this mode', () => {
    render(layout())
    fireEvent.click(handleButton())
    expect(screen.queryByRole('separator')).toBeNull()
  })
})
