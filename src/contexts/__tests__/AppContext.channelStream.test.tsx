import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider, useApp } from '../AppContext'
import type { TwitchStream, TwitchUser } from '../../types/twitch'

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

const profile = (broadcaster_type: TwitchUser['broadcaster_type']) =>
  ({ id: '42', login: 'streamer', display_name: 'Streamer', broadcaster_type }) as TwitchUser

const liveStream = { id: 's1', type: 'live', viewer_count: 7 } as TwitchStream

function loadChannel(
  dispatch: ReturnType<typeof useApp>['dispatch'],
  user: TwitchUser,
  stream: TwitchStream | null,
) {
  dispatch({
    type: 'LOAD_CHANNEL_SUCCESS',
    payload: {
      profile: user,
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

describe('UPDATE_CHANNEL_STREAM', () => {
  it('turns an offline channel live and moves a chatter to streamer mode', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    act(() => loadChannel(result.current.dispatch, profile(''), null))
    expect(result.current.state.channel.isLive).toBe(false)
    expect(result.current.state.displayMode).toBe('chatter')

    act(() => result.current.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))

    expect(result.current.state.channel.isLive).toBe(true)
    expect(result.current.state.channel.stream).toBe(liveStream)
    expect(result.current.state.displayMode).toBe('streamer')
  })

  it('turns a live channel offline and keeps a partner in streamer mode', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    act(() => loadChannel(result.current.dispatch, profile('partner'), liveStream))
    expect(result.current.state.channel.isLive).toBe(true)

    act(() => result.current.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: null }))

    expect(result.current.state.channel.isLive).toBe(false)
    expect(result.current.state.channel.stream).toBeNull()
    expect(result.current.state.displayMode).toBe('streamer')
  })

  it('leaves video mode alone while still recording the new live status', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    act(() => loadChannel(result.current.dispatch, profile(''), null))
    act(() =>
      result.current.dispatch({
        type: 'PLAY_URL',
        url: 'https://example.com/video.m3u8',
        detection: {
          type: 'hls',
          originalUrl: 'https://example.com/video.m3u8',
          playableUrl: 'https://example.com/video.m3u8',
        } as never,
      }),
    )
    expect(result.current.state.displayMode).toBe('video')

    act(() => result.current.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))

    expect(result.current.state.displayMode).toBe('video')
    expect(result.current.state.channel.isLive).toBe(true)
  })

  it('changes nothing when no channel is loaded', () => {
    const { result } = renderHook(() => useApp(), { wrapper })
    const before = result.current.state

    act(() => result.current.dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))

    expect(result.current.state.channel).toBe(before.channel)
    expect(result.current.state.displayMode).toBe('idle')
  })
})
