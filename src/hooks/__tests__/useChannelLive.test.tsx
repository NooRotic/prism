import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { SessionExpiredError, getStreams } from '../../lib/twitchApi'
import type { TwitchStream, TwitchUser } from '../../types/twitch'
import { useChannelLive } from '../useChannelLive'

vi.mock('../../lib/twitchApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/twitchApi')>()),
  getStreams: vi.fn(),
}))

const getStreamsMock = vi.mocked(getStreams)
const liveStream = { id: 's1', type: 'live', viewer_count: 7 } as TwitchStream
const streamer = { id: '42', login: 'streamer', broadcaster_type: 'affiliate' } as TwitchUser

/** Loads an offline channel into the shared state once, so the poll has something to update. */
function Seed() {
  const { dispatch } = useApp()
  useEffect(() => {
    dispatch({
      type: 'LOAD_CHANNEL_SUCCESS',
      payload: {
        profile: streamer,
        channelInfo: {} as never,
        stream: null,
        clips: [],
        videos: [],
        emotes: [],
        badges: [],
        games: new Map(),
      },
    })
  }, [dispatch])
  return null
}

function Probe() {
  const { state } = useApp()
  return <div data-testid="live">{String(state.channel.isLive)}</div>
}

function Poller(props: { userId: string | null; enabled: boolean; onSessionExpired: () => void }) {
  useChannelLive(props)
  return null
}

function Harness(props: {
  poll?: boolean
  userId?: string | null
  enabled?: boolean
  onSessionExpired?: () => void
}) {
  const { poll = true, userId = '42', enabled = true, onSessionExpired = () => {} } = props
  return (
    <AppProvider>
      <Seed />
      <Probe />
      {poll && <Poller userId={userId} enabled={enabled} onSessionExpired={onSessionExpired} />}
    </AppProvider>
  )
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useChannelLive', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    getStreamsMock.mockReset()
    getStreamsMock.mockResolvedValue(null)
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('does nothing while disabled', async () => {
    render(<Harness enabled={false} />)
    await tick(180_000)
    expect(getStreamsMock).not.toHaveBeenCalled()
  })

  it('does nothing without a user id', async () => {
    render(<Harness userId={null} />)
    await tick(180_000)
    expect(getStreamsMock).not.toHaveBeenCalled()
  })

  it('asks once after 60 seconds and puts the answer into the shared state', async () => {
    getStreamsMock.mockResolvedValue(liveStream)
    render(<Harness />)
    await tick(59_000)
    expect(getStreamsMock).not.toHaveBeenCalled()
    await tick(1_000)
    expect(getStreamsMock).toHaveBeenCalledTimes(1)
    expect(getStreamsMock).toHaveBeenCalledWith('42')
    expect(screen.getByTestId('live')).toHaveTextContent('true')
  })

  it('does not ask while the tab is hidden', async () => {
    setVisibility('hidden')
    render(<Harness />)
    await tick(180_000)
    expect(getStreamsMock).not.toHaveBeenCalled()
  })

  it('asks at once when the tab becomes visible again', async () => {
    setVisibility('hidden')
    render(<Harness />)
    await tick(61_000)
    expect(getStreamsMock).not.toHaveBeenCalled()
    setVisibility('visible')
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(getStreamsMock).toHaveBeenCalledTimes(1)
  })

  it('stops asking after it is unmounted', async () => {
    const { unmount } = render(<Harness />)
    await tick(60_000)
    expect(getStreamsMock).toHaveBeenCalledTimes(1)
    unmount()
    await tick(180_000)
    expect(getStreamsMock).toHaveBeenCalledTimes(1)
  })

  it('reports an expired session and does not touch the state', async () => {
    getStreamsMock.mockRejectedValue(new SessionExpiredError())
    const onSessionExpired = vi.fn()
    render(<Harness onSessionExpired={onSessionExpired} />)
    await tick(60_000)
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('live')).toHaveTextContent('false')
  })

  it('ignores any other error and asks again on the next tick', async () => {
    getStreamsMock.mockRejectedValueOnce(new Error('network down'))
    getStreamsMock.mockResolvedValue(liveStream)
    const onSessionExpired = vi.fn()
    render(<Harness onSessionExpired={onSessionExpired} />)
    await tick(60_000)
    expect(onSessionExpired).not.toHaveBeenCalled()
    expect(screen.getByTestId('live')).toHaveTextContent('false')
    await tick(60_000)
    expect(getStreamsMock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('live')).toHaveTextContent('true')
  })

  it('drops an answer that arrives after the user id changed', async () => {
    let resolveOld: (stream: TwitchStream | null) => void = () => {}
    getStreamsMock.mockImplementationOnce(
      () => new Promise<TwitchStream | null>((resolve) => (resolveOld = resolve)),
    )
    const { rerender } = render(<Harness userId="42" />)
    await tick(60_000)
    expect(getStreamsMock).toHaveBeenCalledWith('42')
    rerender(<Harness userId="99" />)
    await act(async () => {
      resolveOld(liveStream)
    })
    expect(screen.getByTestId('live')).toHaveTextContent('false')
  })

  it('drops an answer that arrives after it was unmounted', async () => {
    let resolveOld: (stream: TwitchStream | null) => void = () => {}
    getStreamsMock.mockImplementationOnce(
      () => new Promise<TwitchStream | null>((resolve) => (resolveOld = resolve)),
    )
    const { rerender } = render(<Harness poll />)
    await tick(60_000)
    rerender(<Harness poll={false} />)
    await act(async () => {
      resolveOld(liveStream)
    })
    expect(screen.getByTestId('live')).toHaveTextContent('false')
  })
})
