import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { detectURLType } from '../../lib/urlDetection'
import TwitchPlayerPage from '../TwitchPlayerPage'

// The page's heavy parts are stubs; the real provider and reducer hold the "current content" the page reads.
const rendered = vi.hoisted(() => [] as string[])

vi.mock('../../hooks/useChannelData', () => ({ useChannelData: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({ useTwitchAuth: () => ({ handleAuthError: vi.fn(), isAuthenticated: false }) }))
vi.mock('../../hooks/useChannelLive', () => ({ useChannelLive: vi.fn() }))
vi.mock('../../components/chat/useChatPopout', () => ({ useChatPopout: () => ({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() }) }))
vi.mock('../../components/chat/ChatDock', () => ({ default: ({ player }: { player: ReactNode }) => <div data-testid="chat-dock">{player}</div> }))
vi.mock('../../components/player/PlayerHost', () => ({
  default: ({ url }: { url: string }) => {
    rendered.push(url)
    return <div data-testid="player-host" />
  },
}))
vi.mock('../../components/channel/ProfileSidebar', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/ChannelStatsSlot', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/StatsRow', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/ClipGrid', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/VODGrid', () => ({ default: () => <div /> }))
vi.mock('../../components/layout/DebugPanel', () => ({ default: () => <div /> }))

const handles: { dispatch: ReturnType<typeof useApp>['dispatch'] | null; navigate: ReturnType<typeof useNavigate> | null } = { dispatch: null, navigate: null }
function Expose() {
  const { dispatch } = useApp()
  const nav = useNavigate()
  useEffect(() => {
    handles.dispatch = dispatch
    handles.navigate = nav
  })
  return null
}

function mountAt(path: string) {
  return render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <Expose />
        <Routes>
          <Route path="/" element={<div>home</div>} />
          <Route path="/twitch/:channel" element={<TwitchPlayerPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  )
}

const play = (url: string) => act(() => handles.dispatch?.({ type: 'PLAY_URL', url, detection: detectURLType(url) }))

beforeEach(() => {
  localStorage.clear()
  rendered.length = 0
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('TwitchPlayerPage arriving from another kind of page', () => {
  it('never hands the player the leftover YouTube video while it switches to the channel', () => {
    mountAt('/')
    play('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    act(() => handles.navigate?.('/twitch/streamer'))
    expect(rendered.filter((u) => u.includes('youtube'))).toEqual([])
    // Once the page has pointed the app at the channel, the player shows it.
    expect(rendered[rendered.length - 1]).toBe('https://twitch.tv/streamer')
    expect(screen.getByTestId('player-host')).toBeInTheDocument()
  })

  it('still plays a clip of the channel (a Twitch address that is not the channel itself)', () => {
    mountAt('/twitch/streamer')
    play('https://clips.twitch.tv/SomeClip')
    expect(rendered[rendered.length - 1]).toBe('https://clips.twitch.tv/SomeClip')
  })
})
