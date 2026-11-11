import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { useChannelLive } from '../../hooks/useChannelLive'
import { detectURLType } from '../../lib/urlDetection'
import type { TwitchStream, TwitchUser } from '../../types/twitch'
import TwitchPlayerPage from '../TwitchPlayerPage'

// The real provider, reducer, offline-layout hook, strip and layout; everything heavy is a stub.
// ChatDock stub renders the player it is given, so "how many players are mounted" is countable.
vi.mock('../../hooks/useChannelData', () => ({ useChannelData: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: () => ({ handleAuthError: vi.fn(), isAuthenticated: false }),
}))
vi.mock('../../hooks/useChannelLive', () => ({ useChannelLive: vi.fn() }))
vi.mock('../../components/chat/useChatPopout', () => ({
  useChatPopout: () => ({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() }),
}))
vi.mock('../../components/chat/ChatDock', () => ({
  default: ({ player }: { player: ReactNode }) => <div data-testid="chat-dock">{player}</div>,
}))
vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div data-testid="player-host" /> }))
vi.mock('../../components/channel/ProfileSidebar', () => ({ default: () => <div data-testid="profile" /> }))
vi.mock('../../components/channel/ChannelStatsSlot', () => ({ default: () => <div data-testid="stats-slot" /> }))
vi.mock('../../components/channel/StatsRow', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/ClipGrid', async () => {
  const { useApp } = await import('../../contexts/AppContext')
  const { detectURLType } = await import('../../lib/urlDetection')
  return {
    default: function ClipGridStub() {
      const { dispatch } = useApp()
      return (
        <button
          onClick={() => {
            const url = 'https://clips.twitch.tv/SomeClip'
            dispatch({ type: 'PLAY_URL', url, detection: detectURLType(url) })
          }}
        >
          play clip
        </button>
      )
    },
  }
})
vi.mock('../../components/channel/VODGrid', () => ({ default: () => <div /> }))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => <div /> }))

// The test drives the page from outside: this component hands out the provider's dispatch and the router's navigate.
const handles: { dispatch: ReturnType<typeof useApp>['dispatch'] | null; navigate: ReturnType<typeof useNavigate> | null } = {
  dispatch: null,
  navigate: null,
}
function Expose() {
  const { dispatch } = useApp()
  const nav = useNavigate()
  useEffect(() => {
    handles.dispatch = dispatch
    handles.navigate = nav
  })
  return null
}
const dispatch = (action: Parameters<ReturnType<typeof useApp>['dispatch']>[0]) => handles.dispatch?.(action)

const mockLive = vi.mocked(useChannelLive)
const liveStream = { id: 's1', type: 'live' } as TwitchStream
const user = (login: string) =>
  ({ id: `id-${login}`, login, display_name: login, broadcaster_type: 'affiliate' }) as TwitchUser

function mount(path = '/twitch/streamer') {
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <Expose />
        <Routes>
          <Route path="/twitch/:channel" element={<TwitchPlayerPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  )
}

function signIn() {
  act(() => dispatch({ type: 'LOGIN', token: 't' }))
}

function loadChannel(login: string, stream: TwitchStream | null = null) {
  act(() =>
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
    }),
  )
}

const chatFrames = () => screen.queryAllByTitle(/Twitch chat/)
const lastLiveOptions = () => mockLive.mock.calls[mockLive.mock.calls.length - 1][0]

describe('TwitchPlayerPage: live and offline layouts', () => {
  let scrollTo: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    localStorage.clear()
    mockLive.mockReset()
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps today’s layout for a live channel', () => {
    mount()
    signIn()
    loadChannel('streamer', liveStream)
    expect(screen.getByTestId('chat-dock')).toBeInTheDocument()
    expect(screen.queryByTestId('offline-layout')).toBeNull()
    expect(lastLiveOptions().enabled).toBe(false)
  })

  it('keeps today’s layout when signed out', () => {
    mount()
    loadChannel('streamer')
    expect(screen.getByTestId('chat-dock')).toBeInTheDocument()
    expect(screen.queryByTestId('offline-layout')).toBeNull()
    expect(lastLiveOptions().enabled).toBe(false)
  })

  it('shows the offline layout for a signed-in viewer of an offline channel, with no player', () => {
    mount()
    signIn()
    loadChannel('streamer')
    expect(screen.getByTestId('offline-layout')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-dock')).toBeNull()
    expect(screen.getByTestId('offline-strip')).toHaveTextContent('Offline')
    expect(screen.queryByTestId('player-host')).toBeNull()
    expect(chatFrames()).toHaveLength(1)
    expect(screen.getByTestId('profile')).toBeInTheDocument()
    expect(lastLiveOptions()).toMatchObject({ userId: 'id-streamer', enabled: true })
  })

  it('has the stats slot in both layouts', () => {
    mount()
    signIn()
    loadChannel('streamer')
    expect(screen.getByTestId('stats-slot')).toBeInTheDocument()
    act(() => dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    expect(screen.getByTestId('chat-dock')).toBeInTheDocument()
    expect(screen.getByTestId('stats-slot')).toBeInTheDocument()
  })

  it('unfolds the player on "Show player", keeping the one chat, and scrolls to the top', () => {
    mount()
    signIn()
    loadChannel('streamer')
    const frame = chatFrames()[0]
    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Show player' }))
    expect(screen.getAllByTestId('player-host')).toHaveLength(1)
    expect(screen.getByTestId('offline-layout')).toBeInTheDocument()
    expect(chatFrames()).toHaveLength(1)
    expect(chatFrames()[0]).toBe(frame)
    expect(screen.queryByRole('button', { name: 'Show player' })).toBeNull()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('unfolds the player when a clip is chosen', () => {
    mount()
    signIn()
    loadChannel('streamer')
    fireEvent.click(screen.getByRole('button', { name: 'play clip' }))
    expect(screen.getAllByTestId('player-host')).toHaveLength(1)
  })

  it('goes back to today’s layout when the channel goes live, and scrolls to the top', () => {
    mount()
    signIn()
    loadChannel('streamer')
    scrollTo.mockClear()
    act(() => dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    expect(screen.queryByTestId('offline-layout')).toBeNull()
    expect(screen.getByTestId('chat-dock')).toBeInTheDocument()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(lastLiveOptions().enabled).toBe(false)
  })

  it('keeps the player and the chat exactly where they are when the channel goes live after the viewer unfolded the player', () => {
    mount()
    signIn()
    loadChannel('streamer')
    fireEvent.click(screen.getByRole('button', { name: 'Show player' }))
    const player = screen.getByTestId('player-host')
    const frame = chatFrames()[0]
    scrollTo.mockClear()

    act(() => dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))

    expect(screen.getAllByTestId('player-host')).toHaveLength(1)
    expect(screen.getByTestId('player-host')).toBe(player)
    expect(chatFrames()).toHaveLength(1)
    expect(chatFrames()[0]).toBe(frame)
    expect(screen.getByTestId('offline-layout')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-dock')).toBeNull()
    expect(screen.getByTestId('offline-strip')).toHaveTextContent('Live now')
    expect(scrollTo).not.toHaveBeenCalled()
    expect(lastLiveOptions().enabled).toBe(false)
  })

  it('offers "Watch live" when it went live while a recording plays, and points the player at the live stream', () => {
    mount()
    signIn()
    loadChannel('streamer')
    fireEvent.click(screen.getByRole('button', { name: 'play clip' }))
    act(() => dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    fireEvent.click(screen.getByRole('button', { name: 'Watch live' }))
    expect(screen.queryByRole('button', { name: 'Watch live' })).toBeNull()
    expect(screen.getByTestId('offline-strip')).toHaveTextContent('Live now')
  })

  it('has no "Watch live" button when it went live while the player is already on the live stream', () => {
    mount()
    signIn()
    loadChannel('streamer')
    fireEvent.click(screen.getByRole('button', { name: 'Show player' }))
    act(() => dispatch({ type: 'UPDATE_CHANNEL_STREAM', stream: liveStream }))
    expect(screen.getByTestId('offline-strip')).toHaveTextContent('Live now')
    expect(screen.queryByRole('button', { name: 'Watch live' })).toBeNull()
  })

  it('folds again on the next channel after a route change', () => {
    mount()
    signIn()
    loadChannel('streamer')
    fireEvent.click(screen.getByRole('button', { name: 'Show player' }))
    expect(screen.getAllByTestId('player-host')).toHaveLength(1)

    act(() => handles.navigate?.('/twitch/other'))
    // The page points the player at the new channel before its data has loaded.
    const url = 'https://twitch.tv/other'
    act(() => dispatch({ type: 'PLAY_URL', url, detection: detectURLType(url) }))
    loadChannel('other')

    expect(screen.getByTestId('offline-layout')).toBeInTheDocument()
    expect(screen.queryByTestId('player-host')).toBeNull()
    expect(screen.getByRole('button', { name: 'Show player' })).toBeInTheDocument()
  })
})
