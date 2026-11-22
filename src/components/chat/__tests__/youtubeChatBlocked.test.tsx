import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatDock from '../ChatDock'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { useYoutubeChatPopout } from '../useYoutubeChatPopout'

vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))
vi.mock('../useYoutubeChatPopout', () => ({ useYoutubeChatPopout: vi.fn() }))

const BLOCKED = 'Pop-up blocked. Allow pop-ups for this site to use the chat window.'

beforeEach(() => {
  localStorage.clear()
  vi.mocked(useChatPopout).mockReturnValue({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() })
  vi.mocked(useFullscreen).mockReturnValue({ supported: true, isFullscreen: false, toggle: vi.fn() } as ReturnType<typeof useFullscreen>)
})
afterEach(() => {
  document.documentElement.removeAttribute('data-fill')
  vi.restoreAllMocks()
})

describe('a blocked YouTube chat pop-out', () => {
  it('is reported in the Twitch chat dock, as a blocked Twitch pop-out is', () => {
    vi.mocked(useYoutubeChatPopout).mockReturnValue({ available: true, isOpen: false, blocked: true, open: vi.fn() })
    render(
      <MemoryRouter>
        <ChatDock channel="streamer" player={<div>player</div>} />
      </MemoryRouter>,
    )
    expect(screen.getByText(BLOCKED)).toBeInTheDocument()
  })

  it('says nothing when it was not blocked', () => {
    vi.mocked(useYoutubeChatPopout).mockReturnValue({ available: true, isOpen: false, blocked: false, open: vi.fn() })
    render(
      <MemoryRouter>
        <ChatDock channel="streamer" player={<div>player</div>} />
      </MemoryRouter>,
    )
    expect(screen.queryByText(BLOCKED)).not.toBeInTheDocument()
  })
})
