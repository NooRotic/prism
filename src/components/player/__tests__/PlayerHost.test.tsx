import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerHost from '../PlayerHost'
import { AppProvider } from '../../../contexts/AppContext'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import type { PlayerProps } from '../../../types/player'

// Capture props passed to each mocked player so tests can drive the callbacks.
const sdkProps: PlayerProps[] = []
const iframeProps: PlayerProps[] = []

vi.mock('../TwitchEmbedPlayer', () => ({
  default: (props: PlayerProps) => {
    sdkProps.push(props)
    return <div data-testid="mock-twitch-sdk" />
  },
}))

vi.mock('../TwitchIframePlayer', () => ({
  default: (props: PlayerProps) => {
    iframeProps.push(props)
    return <div data-testid="mock-twitch-iframe" />
  },
}))

vi.mock('../YouTubePlayer', () => ({
  default: () => <div data-testid="mock-youtube" />,
}))

vi.mock('../VideoJSPlayer', () => ({
  default: () => <div data-testid="mock-videojs" />,
}))

vi.mock('../DashJSPlayer', () => ({
  default: () => <div data-testid="mock-dashjs" />,
}))

const streamDetection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-stream',
  originalUrl: 'https://twitch.tv/ninja',
  playableUrl: 'https://twitch.tv/ninja',
  metadata: { channelName: 'ninja' },
}

const clipDetection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-clip',
  originalUrl: 'https://clips.twitch.tv/AbcDef123',
  playableUrl: 'https://clips.twitch.tv/AbcDef123',
  metadata: { clipId: 'AbcDef123' },
}

function renderHost(detection = streamDetection) {
  return render(
    <AppProvider>
      <PlayerHost url={detection.originalUrl} detection={detection} />
    </AppProvider>,
  )
}

describe('PlayerHost', () => {
  beforeEach(() => {
    sdkProps.length = 0
    iframeProps.length = 0
  })

  afterEach(() => {
    cleanup()
  })

  it('starts on the SDK engine for stream detection', async () => {
    renderHost(streamDetection)
    expect(await screen.findByTestId('mock-twitch-sdk')).toBeInTheDocument()
  })

  it('starts on the iframe engine for clip detection (SDK skipped)', async () => {
    renderHost(clipDetection)
    expect(await screen.findByTestId('mock-twitch-iframe')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-twitch-sdk')).not.toBeInTheDocument()
  })

  it('shows offline overlay when the SDK player reports onOffline', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    expect(props.onOffline).toBeDefined()
    act(() => { props.onOffline!() })
    expect(await screen.findByText(/is offline/i)).toBeInTheDocument()
    expect(screen.getByText(/ninja is offline/i)).toBeInTheDocument()
    // SDK stays mounted underneath so ONLINE can re-trigger it
    expect(screen.getByTestId('mock-twitch-sdk')).toBeInTheDocument()
  })

  it('clears offline overlay when SDK player reports onOnline', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    act(() => { props.onOffline!() })
    expect(await screen.findByText(/is offline/i)).toBeInTheDocument()
    act(() => { props.onOnline!() })
    expect(screen.queryByText(/is offline/i)).not.toBeInTheDocument()
  })

  it('does NOT advance the fallback chain on offline (iframe not mounted)', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    act(() => { props.onOffline!() })
    expect(screen.queryByTestId('mock-twitch-iframe')).not.toBeInTheDocument()
  })

  it('shows Content ID and Parent rows in debug overlay', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    // Debug overlay is on by default — no need to toggle it
    const contentRow = screen.getByText(/Content ID:/i).parentElement
    expect(contentRow?.textContent).toMatch(/ninja/)
    expect(screen.getByText(/Parent:/i)).toBeInTheDocument()
  })

  it('force-advance button advances from SDK to iframe', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await user.click(screen.getByLabelText('Force advance fallback chain'))
    expect(await screen.findByTestId('mock-twitch-iframe')).toBeInTheDocument()
  })

  it('retry-from-start resets to the recommended engine', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await user.click(screen.getByLabelText('Force advance fallback chain'))
    await user.click(screen.getByLabelText('Force advance fallback chain'))
    await user.click(
      screen.getByLabelText('Retry from start of fallback chain'),
    )
    expect(await screen.findByTestId('mock-twitch-sdk')).toBeInTheDocument()
  })

  it('retry-from-start also clears the offline overlay', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    act(() => { props.onOffline!() })
    expect(await screen.findByText(/is offline/i)).toBeInTheDocument()
    await user.click(
      screen.getByLabelText('Retry from start of fallback chain'),
    )
    expect(screen.queryByText(/is offline/i)).not.toBeInTheDocument()
  })
})
