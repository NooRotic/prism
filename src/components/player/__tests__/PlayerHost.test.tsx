import { render, screen, cleanup, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerHost from '../PlayerHost'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import type { PlayerProps } from '../../../types/player'

// Capture props passed to each mocked player so tests can drive the callbacks.
const sdkProps: PlayerProps[] = []
const iframeProps: PlayerProps[] = []
const vjsProps: PlayerProps[] = []
// Lets a single test force a render crash inside the player so the error
// boundary path is exercised.
const sdkBehavior = { throwOnRender: false }
const vjsBehavior = { throwOnRender: false }

vi.mock('../TwitchEmbedPlayer', () => ({
  default: (props: PlayerProps) => {
    sdkProps.push(props)
    if (sdkBehavior.throwOnRender) throw new Error('simulated player crash')
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
  default: (props: PlayerProps) => {
    vjsProps.push(props)
    if (vjsBehavior.throwOnRender) throw new Error('simulated player crash')
    return <div data-testid="mock-videojs" />
  },
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

// The real toggle lives in the header (see Header.tsx), outside the player.
// This stand-in lets the tests switch debug mode on the way the header does.
function DebugSwitch() {
  const { dispatch } = useApp()
  return (
    <button aria-label="test debug switch" onClick={() => dispatch({ type: 'TOGGLE_DEBUG' })} />
  )
}

function renderHost(detection = streamDetection) {
  return render(
    <AppProvider>
      <PlayerHost url={detection.originalUrl} detection={detection} />
      <DebugSwitch />
    </AppProvider>,
  )
}

// The debug overlay is off by default, so tests that drive its controls
// have to open it the way a user would.
async function openDebugOverlay(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('test debug switch'))
}

describe('PlayerHost', () => {
  beforeEach(() => {
    sdkProps.length = 0
    iframeProps.length = 0
    vjsProps.length = 0
    sdkBehavior.throwOnRender = false
    vjsBehavior.throwOnRender = false
  })

  afterEach(() => {
    cleanup()
  })

  it('starts on the SDK engine for stream detection', async () => {
    renderHost(streamDetection)
    expect(await screen.findByTestId('mock-twitch-sdk')).toBeInTheDocument()
  })

  // Anything drawn over the Twitch embed makes Twitch's visibility check fail
  // and disables autoplay (verified 2026-11-04: hiding the old in-player gear
  // button flipped the check and playback started). With debug mode off and
  // the stream online, the player host must render no controls at all.
  it('renders no controls over the player', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const host = document.getElementById('player-host-outer') as HTMLElement
    expect(within(host).queryAllByRole('button')).toHaveLength(0)
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
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await openDebugOverlay(user)
    const contentRow = screen.getByText(/Content ID:/i).parentElement
    expect(contentRow?.textContent).toMatch(/ninja/)
    expect(screen.getByText(/Parent:/i)).toBeInTheDocument()
  })

  it('force-advance button advances from SDK to iframe', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await openDebugOverlay(user)
    await user.click(screen.getByLabelText('Force advance fallback chain'))
    expect(await screen.findByTestId('mock-twitch-iframe')).toBeInTheDocument()
  })

  it('retry-from-start resets to the recommended engine', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await openDebugOverlay(user)
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
    await openDebugOverlay(user)
    await user.click(
      screen.getByLabelText('Retry from start of fallback chain'),
    )
    expect(screen.queryByText(/is offline/i)).not.toBeInTheDocument()
  })
  it('shows the fallback card when a player crashes mid-render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    sdkBehavior.throwOnRender = true

    renderHost(streamDetection)

    expect(await screen.findByText('Unable to Play')).toBeInTheDocument()
    expect(screen.queryByText(/ERROR BOUNDARY CAUGHT/i)).not.toBeInTheDocument()

    warn.mockRestore()
    err.mockRestore()
  })
})

describe('PlayerHost on an HLS stream', () => {
  const hlsDetection: URLDetectionResult = {
    type: 'hls',
    originalUrl: 'https://h/a.m3u8',
    playableUrl: 'https://h/a.m3u8',
  }

  function renderHls(extra: Partial<React.ComponentProps<typeof PlayerHost>> = {}) {
    return render(
      <AppProvider>
        <PlayerHost url={hlsDetection.originalUrl} detection={hlsDetection} {...extra} />
      </AppProvider>,
    )
  }

  beforeEach(() => {
    vjsProps.length = 0
    vjsBehavior.throwOnRender = false
  })

  afterEach(() => {
    cleanup()
  })

  it('hands a custom error view the player error instead of the fallback card', async () => {
    const renderError = vi.fn((error: string | null) => <div data-testid="custom-error">{error}</div>)
    renderHls({ renderError })
    await screen.findByTestId('mock-videojs')

    act(() => { vjsProps[vjsProps.length - 1].onError!('boom') })

    expect(await screen.findByTestId('custom-error')).toHaveTextContent('boom')
    expect(renderError).toHaveBeenCalledWith('boom')
    expect(screen.queryByText('Unable to Play')).not.toBeInTheDocument()
  })

  it('shows the custom error view too when the player crashes while rendering', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vjsBehavior.throwOnRender = true

    renderHls({ renderError: () => <div data-testid="custom-error" /> })

    expect(await screen.findByTestId('custom-error')).toBeInTheDocument()
    expect(screen.queryByText('Unable to Play')).not.toBeInTheDocument()
    warn.mockRestore()
    err.mockRestore()
  })

  it('keeps the fallback card when no custom error view is given', async () => {
    renderHls()
    await screen.findByTestId('mock-videojs')

    act(() => { vjsProps[vjsProps.length - 1].onError!('boom') })

    expect(await screen.findByText('Unable to Play')).toBeInTheDocument()
  })

  it('forwards the stall and playing handlers to the player', async () => {
    const onStall = vi.fn()
    const onPlaying = vi.fn()
    renderHls({ onStall, onPlaying })
    await screen.findByTestId('mock-videojs')

    const props = vjsProps[vjsProps.length - 1]
    expect(props.onStall).toBe(onStall)
    expect(props.onPlaying).toBe(onPlaying)
  })
})
