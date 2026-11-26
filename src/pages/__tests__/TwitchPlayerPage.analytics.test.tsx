import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { useStayed } from '../../hooks/useStayed'
import { trackEvent } from '../../lib/analytics'
import { detectURLType } from '../../lib/urlDetection'
import TwitchPlayerPage from '../TwitchPlayerPage'

// What this page tells the owner's Matomo. The page's heavy parts are stubs, as in TwitchPlayerPage.stale.test.tsx.
vi.mock('../../lib/analytics', async (original) => ({ ...(await original<typeof import('../../lib/analytics')>()), trackEvent: vi.fn() }))
vi.mock('../../hooks/useStayed', () => ({ useStayed: vi.fn() }))
vi.mock('../../hooks/useChannelData', () => ({ useChannelData: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({ useTwitchAuth: () => ({ handleAuthError: vi.fn(), isAuthenticated: false }) }))
vi.mock('../../hooks/useChannelLive', () => ({ useChannelLive: vi.fn() }))
vi.mock('../../components/chat/useChatPopout', () => ({ useChatPopout: () => ({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() }) }))
vi.mock('../../components/chat/ChatDock', () => ({ default: ({ player }: { player: ReactNode }) => <div>{player}</div> }))
vi.mock('../../components/player/PlayerHost', () => ({ default: () => <div /> }))
vi.mock('../../components/channel/ChannelBody', () => ({ default: () => <div /> }))
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

const mountAt = (path: string) =>
  render(
    <AppProvider>
      <MemoryRouter initialEntries={[path]}>
        <Expose />
        <Routes>
          <Route path="/twitch/:channel" element={<TwitchPlayerPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  )
const go = (to: string) => act(() => handles.navigate?.(to))
const opened = () => vi.mocked(trackEvent).mock.calls
const lastStayed = () => vi.mocked(useStayed).mock.lastCall

beforeEach(() => {
  localStorage.clear()
  vi.mocked(trackEvent).mockClear()
  vi.mocked(useStayed).mockClear()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

describe('TwitchPlayerPage: channels opened', () => {
  it('reports the channel once, in lower case, and each one moved to', () => {
    mountAt('/twitch/Shroud')
    act(() => handles.dispatch?.({ type: 'PLAY_URL', url: 'https://clips.twitch.tv/SomeClip', detection: detectURLType('https://clips.twitch.tv/SomeClip') }))
    expect(opened()).toEqual([['Twitch', 'opened', 'shroud']])

    go('/twitch/xqc')
    expect(opened()).toEqual([['Twitch', 'opened', 'shroud'], ['Twitch', 'opened', 'xqc']])
  })

  it('is one channel however it is written', () => {
    mountAt('/twitch/Shroud')
    go('/twitch/shroud')

    expect(opened()).toEqual([['Twitch', 'opened', 'shroud']])
  })

  it('reports nothing for text that cannot be a channel', () => {
    mountAt('/twitch/not%20a%20login')

    expect(opened()).toEqual([])
    expect(lastStayed()).toEqual([null, false])
  })

  it('counts the stay under the channel', () => {
    mountAt('/twitch/Shroud')

    expect(lastStayed()).toEqual(['shroud', false])
  })
})
