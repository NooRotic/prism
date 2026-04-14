import { render, screen, cleanup } from '@testing-library/react'
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
})
