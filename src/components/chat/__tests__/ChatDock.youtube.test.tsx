import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatDock from '../ChatDock'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { saveLink } from '../../../lib/linkedAccounts'

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
})
