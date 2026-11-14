import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HlsPage from '../HlsPage'
import { useApp } from '../../contexts/AppContext'
import { buildStreamPath } from '../../lib/routes'
import type { PlayerProps } from '../../types/player'

type HostProps = PlayerProps & {
  renderError?: (error: string | null) => React.ReactNode
  onStall?: () => void
  onPlaying?: () => void
}

// A stand-in for PlayerHost that records what the page hands it and lets a test trigger, from real
// buttons, the callbacks a real player would fire.
const host = vi.hoisted(() => ({ props: [] as HostProps[], mounts: 0 }))

vi.mock('../../components/player/PlayerHost', async () => {
  const { useEffect, useState } = await import('react')
  return {
    default: function MockPlayerHost(props: HostProps) {
      host.props.push(props)
      const [failed, setFailed] = useState(false)
      useEffect(() => {
        host.mounts += 1
      }, [])
      return (
        <div data-testid="player-host">
          <button onClick={() => setFailed(true)}>fail</button>
          <button onClick={() => props.onStall?.()}>stall</button>
          <button onClick={() => props.onPlaying?.()}>play</button>
          {failed && props.renderError?.('boom')}
        </div>
      )
    },
  }
})

vi.mock('../../components/player/StreamStatus', () => ({
  StreamErrorCard: (p: {
    url: string
    kind: string
    guessedKind: boolean
    playerError: string | null
    onRetry: () => void
    onTryAs: (kind: string) => void
  }) => (
    <div data-testid="error-card" data-url={p.url} data-kind={p.kind} data-guessed={String(p.guessedKind)}>
      {p.playerError}
      <button onClick={p.onRetry}>error retry</button>
      <button onClick={() => p.onTryAs('dash')}>try dash</button>
    </div>
  ),
  StreamStallNotice: (p: { onRetry: () => void }) => (
    <div data-testid="stall-notice">
      <button onClick={p.onRetry}>stall retry</button>
    </div>
  ),
}))

vi.mock('../../components/layout/DebugPanel', () => ({ default: () => null }))
vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))

const dispatch = vi.fn()

function Nav({ to }: { to: string }) {
  const navigate = useNavigate()
  return <button onClick={() => navigate(to)}>go {to}</button>
}

function LocationSpy() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderAt(entry: string, extra?: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="hls-dash/:streamId?" element={<HlsPage />} />
      </Routes>
      <LocationSpy />
      {extra}
    </MemoryRouter>,
  )
}

const lastProps = () => host.props[host.props.length - 1]
const APPLE =
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8'

beforeEach(() => {
  host.props.length = 0
  host.mounts = 0
  dispatch.mockReset()
  vi.mocked(useApp).mockReturnValue({
    state: { player: { currentUrl: null, detection: null, debugMode: false } },
    dispatch,
  } as unknown as ReturnType<typeof useApp>)
})

afterEach(() => {
  cleanup()
})

// The cases of the old player page (HlsDashPlayerPage), kept for the page that replaced it: playing, the error card, the
// stall notice, retry, try-as, and moving between addresses. The server is switched off under the test runner, so the page
// runs on its built-in demo list here. Two cases changed with the new layout (see their comments); none was dropped.
describe('HlsPage: the player behaviour the old player page had', () => {
  it('plays a demo entry by its id and tells the app what is playing', () => {
    renderAt('/hls-dash/apple-basic')

    expect(lastProps().url).toBe(APPLE)
    expect(lastProps().detection.type).toBe('hls')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PLAY_URL', url: APPLE }),
    )
  })

  // Changed with the new layout: the player panel's own title row ("HLS Stream Player" and the address) is switched off on
  // this page, and the About panel names what plays instead, by its host.
  it('plays a pasted address, and the About panel names it by its host', () => {
    renderAt(buildStreamPath('https://h/x.m3u8'))

    expect(lastProps().url).toBe('https://h/x.m3u8')
    expect(screen.queryByRole('heading', { name: /HLS Stream Player/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pasted address' })).toBeInTheDocument()
    expect(screen.getByText('h')).toBeInTheDocument()
  })

  it('tries an address with no recognisable ending as HLS', () => {
    renderAt(buildStreamPath('https://h/live/playlist'))

    expect(lastProps().detection.type).toBe('hls')
  })

  // Changed with the new layout: the old "Browse the HLS / DASH demos" link pointed at the listing page, which is now this
  // page, so the message sends the visitor to the list below instead (and the list is on screen).
  it('says so when no stream has that id, with the list still on the page', () => {
    renderAt('/hls-dash/does-not-exist')

    expect(screen.getByText(/No stream called/)).toBeInTheDocument()
    expect(screen.getByText(/pick a stream from the list/i)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /stream list/i })).toBeInTheDocument()
    expect(screen.queryByTestId('player-host')).not.toBeInTheDocument()
  })

  it('does not treat a Twitch demo id as a stream', () => {
    renderAt('/hls-dash/hasanabi')

    expect(screen.getByText(/No stream called/)).toBeInTheDocument()
    expect(screen.queryByTestId('player-host')).not.toBeInTheDocument()
  })

  it('asks for an address when the custom page is opened without one', () => {
    renderAt('/hls-dash/custom')

    expect(screen.getByText(/No stream address was given/)).toBeInTheDocument()
    expect(screen.queryByTestId('player-host')).not.toBeInTheDocument()
  })

  it('says a Twitch address is not a stream this page plays', () => {
    renderAt(buildStreamPath('https://twitch.tv/xqc'))

    expect(screen.getByText(/isn't an HLS, DASH or MP4 stream/)).toBeInTheDocument()
    expect(screen.queryByTestId('player-host')).not.toBeInTheDocument()
  })

  it('shows the diagnosis card, with what it needs, when the player gives up', async () => {
    renderAt(buildStreamPath('https://h/live/playlist'))
    await userEvent.setup().click(screen.getByRole('button', { name: 'fail' }))

    const card = await screen.findByTestId('error-card')
    expect(card).toHaveAttribute('data-url', 'https://h/live/playlist')
    expect(card).toHaveAttribute('data-kind', 'hls')
    expect(card).toHaveAttribute('data-guessed', 'true')
    expect(card).toHaveTextContent('boom')
  })

  it('shows the stall notice while the stream is slow and drops it once it plays', async () => {
    renderAt(buildStreamPath('https://h/x.m3u8'))
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'stall' }))
    expect(screen.getByTestId('stall-notice')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'play' }))
    expect(screen.queryByTestId('stall-notice')).not.toBeInTheDocument()
  })

  it('shows only the error card when a stalled stream then fails', async () => {
    renderAt(buildStreamPath('https://h/x.m3u8'))
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'stall' }))
    expect(screen.getByTestId('stall-notice')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'fail' }))

    expect(await screen.findByTestId('error-card')).toBeInTheDocument()
    expect(screen.queryByTestId('stall-notice')).not.toBeInTheDocument()
  })

  it('does not bring the stall notice back beside the error card', async () => {
    renderAt(buildStreamPath('https://h/x.m3u8'))
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'fail' }))
    await screen.findByTestId('error-card')
    await user.click(screen.getByRole('button', { name: 'stall' }))

    expect(screen.queryByTestId('stall-notice')).not.toBeInTheDocument()
  })

  it('starts the player over on Retry and clears the stall notice', async () => {
    renderAt(buildStreamPath('https://h/x.m3u8'))
    const user = userEvent.setup()
    expect(host.mounts).toBe(1)

    await user.click(screen.getByRole('button', { name: 'stall' }))
    await user.click(screen.getByRole('button', { name: 'stall retry' }))

    expect(host.mounts).toBe(2)
    expect(screen.queryByTestId('stall-notice')).not.toBeInTheDocument()
  })

  it('tries the address as another kind, keeping the address', async () => {
    renderAt(buildStreamPath('https://h/live/playlist'))
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'fail' }))
    await user.click(await screen.findByRole('button', { name: 'try dash' }))

    expect(screen.getByTestId('location')).toHaveTextContent(buildStreamPath('https://h/live/playlist', 'dash'))
    expect(lastProps().detection.type).toBe('dash')
    expect(host.mounts).toBe(2)
  })

  it('moves to a second pasted address cleanly: new url, no leftover stall notice', async () => {
    const second = buildStreamPath('https://h/second.m3u8')
    renderAt(buildStreamPath('https://h/first.m3u8'), <Nav to={second} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'stall' }))
    expect(screen.getByTestId('stall-notice')).toBeInTheDocument()

    await act(async () => {
      await user.click(screen.getByRole('button', { name: `go ${second}` }))
    })

    expect(lastProps().url).toBe('https://h/second.m3u8')
    expect(screen.queryByTestId('stall-notice')).not.toBeInTheDocument()
  })
})
