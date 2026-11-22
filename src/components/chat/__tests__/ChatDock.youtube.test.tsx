import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatDock from '../ChatDock'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { saveLink } from '../../../lib/linkedAccounts'
import { FloatingVideoContext, type FloatingVideoControls } from '../floatingVideoContext'

vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))

const TARGET = 'v:abcdefghijk@UC1'

beforeEach(() => {
  localStorage.clear()
  vi.mocked(useChatPopout).mockReset()
  vi.mocked(useChatPopout).mockReturnValue({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() })
  vi.mocked(useFullscreen).mockReset()
  vi.mocked(useFullscreen).mockReturnValue({ supported: true, isFullscreen: false, toggle: vi.fn() } as ReturnType<typeof useFullscreen>)
})
afterEach(() => {
  document.documentElement.removeAttribute('data-fill')
  vi.restoreAllMocks()
})

describe('ChatDock holding a YouTube chat', () => {
  it('shows YouTube’s chat for the target', () => {
    render(<ChatDock kind="youtube" channel={TARGET} player={<div>player</div>} />)
    expect(screen.getByTitle('YouTube live chat')).toBeInTheDocument()
    expect(screen.queryByTitle(`${TARGET} Twitch chat`)).not.toBeInTheDocument()
  })

  it('pops out into the YouTube chat window', () => {
    render(<ChatDock kind="youtube" channel={TARGET} player={<div>player</div>} />)
    expect(useChatPopout).toHaveBeenCalledWith(TARGET, undefined, 'youtube')
  })

  it('never offers the linked-streamer button, even if a link matches the text', () => {
    saveLink({ twitch: TARGET.toLowerCase(), youtube: { channelId: 'UC1', title: 'x' }, confirmed: false, linkedAt: 1 })
    render(<ChatDock kind="youtube" channel={TARGET} player={<div>player</div>} />)
    expect(screen.queryByRole('button', { name: 'Pop out YouTube chat' })).not.toBeInTheDocument()
  })

  it('still holds the Twitch chat by default', () => {
    render(<ChatDock channel="streamer" player={<div>player</div>} />)
    expect(screen.getByTitle('streamer Twitch chat')).toBeInTheDocument()
  })

  it('pops a live video out at the live edge, never from the elapsed time (the dock is shown only for live videos)', () => {
    const controls: FloatingVideoControls = {
      supported: true, canOpen: true, isFloating: false, blocked: false, failed: false, open: vi.fn(), close: vi.fn(), registerSource: vi.fn(),
    }
    const player = document.createElement('youtube-video') as HTMLElement & { currentTime?: number }
    player.currentTime = 42
    document.body.appendChild(player)
    render(
      <FloatingVideoContext.Provider value={controls}>
        <ChatDock kind="youtube" channel={TARGET} player={<div>player</div>} />
      </FloatingVideoContext.Provider>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Pop out video' })[0])
    expect(controls.open).toHaveBeenCalledTimes(1)
    expect(vi.mocked(controls.open).mock.calls[0][0]?.startSec).toBeUndefined()
    player.remove()
  })
})
