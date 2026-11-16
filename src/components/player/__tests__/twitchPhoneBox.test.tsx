import { render, screen } from '@testing-library/react'
import { render as renderRaw } from '@testing-library/react'
import ChatDock from '../../chat/ChatDock'
import OfflineLayout from '../../channel/OfflineLayout'
import TwitchEmbedPlayer from '../TwitchEmbedPlayer'
import TwitchIframePlayer from '../TwitchIframePlayer'
import { useChatPopout } from '../../chat/useChatPopout'
import { useFullscreen } from '../../chat/useFullscreen'
import { useLandscapePhone } from '../../chat/useLandscapePhone'
import type { URLDetectionResult } from '../../../lib/urlDetection'

vi.mock('../../chat/useChatPopout', () => ({ useChatPopout: vi.fn() }))
vi.mock('../../chat/useFullscreen', () => ({ useFullscreen: vi.fn() }))
vi.mock('../../chat/useLandscapePhone', () => ({ useLandscapePhone: vi.fn() }))

// On a touch phone held upright the Twitch box is a true 16:9 (no black bars above and below the
// video). Twitch documents its 400x300 autoplay minimum as not applying on mobile devices, so
// the 300px floor is lifted only for a coarse pointer below the md breakpoint; everywhere else
// it stays. `max-md:pointer-coarse:min-h-0` is that one condition, on every element in the chain.
const LIFT = 'max-md:pointer-coarse:min-h-0'

const detection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-stream',
  originalUrl: 'https://twitch.tv/ninja',
  playableUrl: 'https://twitch.tv/ninja',
  metadata: { channelName: 'ninja' },
}

describe('the Twitch box on a touch phone in portrait', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(useChatPopout).mockReturnValue({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() })
    vi.mocked(useFullscreen).mockReturnValue({ supported: false, isFullscreen: false, toggle: vi.fn() })
    vi.mocked(useLandscapePhone).mockReturnValue(false)
  })

  it('the live page box keeps its 300px floor but lifts it on a touch phone', () => {
    render(<ChatDock channel="streamer" player={<div>player</div>} />)
    expect(screen.getByTestId('chat-player')).toHaveClass('min-h-[300px]', LIFT)
  })

  it('the offline page box keeps its 300px floor but lifts it on a touch phone', () => {
    render(
      <OfflineLayout channel="streamer" strip={<div>strip</div>} player={<div>player</div>}>
        <div>body</div>
      </OfflineLayout>,
    )
    expect(screen.getByTestId('offline-player')).toHaveClass('min-h-[300px]', LIFT)
  })

  it('the embed host lifts its floor the same way, with no inline minimum to defeat it', () => {
    const { container } = renderRaw(<TwitchEmbedPlayer url={detection.originalUrl} detection={detection} />)
    const host = container.firstElementChild as HTMLElement
    expect(host).toHaveClass('min-h-[300px]', LIFT)
    expect(host.style.minHeight).toBe('')
  })

  it('the raw iframe fallback lifts its floor the same way', () => {
    const { container } = renderRaw(<TwitchIframePlayer url={detection.originalUrl} detection={detection} />)
    const frame = container.querySelector('iframe') as HTMLElement
    expect(frame).toHaveClass('min-h-[300px]', LIFT)
    expect(frame.style.minHeight).toBe('')
  })
})
