import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { AppProvider, useApp } from '../../contexts/AppContext'
import type { URLDetectionResult } from '../../lib/urlDetection'
import type { TwitchStream, TwitchUser } from '../../types/twitch'
import { useOfflineLayout } from '../useOfflineLayout'

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

const user = (login: string) =>
  ({ id: login, login, display_name: login, broadcaster_type: 'affiliate' }) as TwitchUser
const liveStream = { id: 's1', type: 'live' } as TwitchStream

type Dispatch = ReturnType<typeof useApp>['dispatch']

function loadChannel(dispatch: Dispatch, login: string, stream: TwitchStream | null = null) {
  dispatch({
    type: 'LOAD_CHANNEL_SUCCESS',
    payload: {
      profile: user(login),
      channelInfo: {} as never,
      stream,
      clips: [],
      videos: [],
      emotes: [],
      badges: [],
      games: new Map(),
    },
  })
}

function setup(channel: string | undefined, { signedIn = true } = {}) {
  const hook = renderHook(
    ({ route }: { route: string | undefined }) => ({ layout: useOfflineLayout(route), app: useApp() }),
    { wrapper, initialProps: { route: channel } },
  )
  if (signedIn) act(() => hook.result.current.app.dispatch({ type: 'LOGIN', token: 't' }))
  return hook
}

function play(dispatch: Dispatch, detection: URLDetectionResult) {
  dispatch({ type: 'PLAY_URL', url: detection.originalUrl, detection })
}

const clip: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-clip',
  originalUrl: 'https://clips.twitch.tv/Abc',
  metadata: { clipId: 'Abc' },
}
const video: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-video',
  originalUrl: 'https://twitch.tv/videos/1',
  metadata: { videoId: '1' },
}
const stream = (channelName: string): URLDetectionResult => ({
  type: 'twitch',
  platform: 'twitch-stream',
  originalUrl: `https://twitch.tv/${channelName}`,
  metadata: { channelName },
})

describe('useOfflineLayout: when the page is offline', () => {
  it('is offline and folded for a signed-in viewer of a loaded, offline channel', () => {
    const { result } = setup('streamer')
    act(() => loadChannel(result.current.app.dispatch, 'streamer'))
    expect(result.current.layout).toMatchObject({ offline: true, folded: true })
  })

  it('matches the channel without regard to letter case', () => {
    const { result } = setup('Streamer')
    act(() => loadChannel(result.current.app.dispatch, 'streamer'))
    expect(result.current.layout.offline).toBe(true)
  })

  it('is not offline when signed out', () => {
    const { result } = setup('streamer', { signedIn: false })
    act(() => loadChannel(result.current.app.dispatch, 'streamer'))
    expect(result.current.layout.offline).toBe(false)
  })

  it('is not offline while the loaded profile belongs to another channel', () => {
    const { result } = setup('streamer')
    act(() => loadChannel(result.current.app.dispatch, 'other'))
    expect(result.current.layout.offline).toBe(false)
  })

  it('is not offline when the channel is live', () => {
    const { result } = setup('streamer')
    act(() => loadChannel(result.current.app.dispatch, 'streamer', liveStream))
    expect(result.current.layout.offline).toBe(false)
  })

  it('is not offline before any channel has loaded', () => {
    const { result } = setup('streamer')
    expect(result.current.layout.offline).toBe(false)
  })

  it('is not offline without a route channel', () => {
    const { result } = setup(undefined)
    act(() => loadChannel(result.current.app.dispatch, 'streamer'))
    expect(result.current.layout.offline).toBe(false)
  })
})

describe('useOfflineLayout: the folded player', () => {
  function offlineHook(channel = 'streamer') {
    const hook = setup(channel)
    act(() => loadChannel(hook.result.current.app.dispatch, channel))
    return hook
  }

  it('unfolds when the viewer asks for the player', () => {
    const { result } = offlineHook()
    act(() => result.current.layout.showPlayer())
    expect(result.current.layout).toMatchObject({ offline: true, folded: false })
  })

  it.each([
    ['a clip', clip],
    ['a recording', video],
    ["another channel's stream", stream('someoneelse')],
  ])('unfolds by itself when %s is chosen', (_label, detection) => {
    const { result } = offlineHook()
    act(() => play(result.current.app.dispatch, detection))
    expect(result.current.layout.folded).toBe(false)
  })

  it("stays folded for the channel's own live stream URL, whatever its letter case", () => {
    const { result } = offlineHook()
    act(() => play(result.current.app.dispatch, stream('STREAMER')))
    expect(result.current.layout.folded).toBe(true)
  })

  it('folds again when the route moves to another channel', () => {
    const { result, rerender } = offlineHook()
    act(() => result.current.layout.showPlayer())
    expect(result.current.layout.folded).toBe(false)
    rerender({ route: 'other' })
    act(() => loadChannel(result.current.app.dispatch, 'other'))
    expect(result.current.layout).toMatchObject({ offline: true, folded: true })
  })

  it('is not offline once a still-folded channel goes live, and folds again if it goes offline again', () => {
    const { result } = offlineHook()
    act(() => result.current.app.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    expect(result.current.layout).toMatchObject({ offline: false, live: true })
    act(() => result.current.app.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: null }))
    expect(result.current.layout).toMatchObject({ offline: true, folded: true, live: false })
  })

  it('stays in the offline layout, unfolded, when the channel goes live after the viewer unfolded the player, so what they are watching is not interrupted', () => {
    const { result } = offlineHook()
    act(() => result.current.layout.showPlayer())
    act(() => result.current.app.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    expect(result.current.layout).toMatchObject({ offline: true, folded: false, live: true })
  })

  it('leaves the offline layout for good when the viewer who unfolded it moves to another channel', () => {
    const { result, rerender } = offlineHook()
    act(() => result.current.layout.showPlayer())
    act(() => result.current.app.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    rerender({ route: 'other' })
    expect(result.current.layout).toMatchObject({ offline: false, folded: false })
    act(() => loadChannel(result.current.app.dispatch, 'other', liveStream))
    expect(result.current.layout).toMatchObject({ offline: false })
  })

  it('leaves the offline layout when the viewer signs out', () => {
    const { result } = offlineHook()
    act(() => result.current.layout.showPlayer())
    act(() => result.current.app.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    expect(result.current.layout.offline).toBe(true)
    act(() => result.current.app.dispatch({ type: 'LOGOUT' }))
    expect(result.current.layout.offline).toBe(false)
  })

  it('does not unfold on a stale detection of the previous channel after a route change', () => {
    const { result, rerender } = offlineHook()
    act(() => play(result.current.app.dispatch, stream('streamer')))
    rerender({ route: 'other' })
    // The old channel's profile is still loaded: not offline, so nothing is folded or unfolded yet,
    // even though the detection still names the old channel.
    expect(result.current.layout).toMatchObject({ offline: false, folded: false })
    // The page's own effect points the player at the new channel, then its data arrives.
    act(() => play(result.current.app.dispatch, stream('other')))
    act(() => loadChannel(result.current.app.dispatch, 'other'))
    expect(result.current.layout).toMatchObject({ offline: true, folded: true })
  })
})
