import { render, screen } from '@testing-library/react'
import ChatDock from '../ChatDock'
import { useChatPopout } from '../useChatPopout'
import { useFullscreen } from '../useFullscreen'
import { useLandscapePhone } from '../useLandscapePhone'

vi.mock('../useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../useFullscreen', () => ({ useFullscreen: vi.fn() }))
vi.mock('../useLandscapePhone', () => ({ useLandscapePhone: vi.fn() }))

// In portrait the chat panel has no fixed height, so a percentage height on the chat iframe
// resolves to `auto` and the browser gives the iframe its 150px default: the chat shows a
// 150px sliver over an empty panel. The chat area has to give the iframe a definite height
// (an absolutely placed box fills its parent whatever the parent's height rule is).
describe('ChatDock chat height in portrait', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useChatPopout).mockReturnValue({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() })
    vi.mocked(useFullscreen).mockReturnValue({ supported: false, isFullscreen: false, toggle: vi.fn() })
    vi.mocked(useLandscapePhone).mockReturnValue(false)
  })

  it('places the scaled chat in an absolutely filled box inside a relative chat area', () => {
    render(<ChatDock channel="streamer" player={<div>player</div>} />)
    const fill = screen.getByTestId('scaled-chat').parentElement as HTMLElement
    expect(fill).toHaveClass('absolute', 'inset-0')
    expect(fill.parentElement).toHaveClass('relative', 'flex-1', 'min-h-0')
  })

  it('gives the stacked chat panel a tall minimum below md, not the bare 300px', () => {
    render(<ChatDock channel="streamer" player={<div>player</div>} />)
    expect(screen.getByTestId('chat-panel')).toHaveClass('max-md:min-h-[60dvh]')
  })
})
