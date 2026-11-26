import { act, render } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { STORAGE_KEYS } from '../../../config/storageKeys'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useYourStats } from '../../../hooks/useYourStats'
import { useCategoryStreams } from '../../../hooks/useCategoryStreams'
import { useChannelData } from '../../../hooks/useChannelData'
import FollowingPanel from '../FollowingPanel'
import YourStatsPanel from '../YourStatsPanel'
import CategoryPanel from '../CategoryPanel'
import ChannelRail from '../../rail/ChannelRail'
import TwitchPlayerPage from '../../../pages/TwitchPlayerPage'

// Backlog item 14. The follows store, the stats, the category list and the channel loader each
// report a 401 through the `handleAuthError` callback their component hands them. That callback used
// to be `handleAuthError(null)`, which does nothing, so the viewer stayed "signed in" with a Retry
// that could never work. Here the real provider and the real useSessionExpiry run; only the data
// hooks are stubbed, so "a 401" is the callback the component passed, called by the test.
vi.mock('../../../hooks/useFollowedChannels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useFollowedChannels')>()
  return { ...actual, useFollowedChannels: vi.fn() }
})
vi.mock('../../../hooks/useYourStats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useYourStats')>()
  return { ...actual, useYourStats: vi.fn() }
})
vi.mock('../../../hooks/useCategoryStreams', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../hooks/useCategoryStreams')>()
  return { ...actual, useCategoryStreams: vi.fn() }
})
vi.mock('../../../hooks/useChannelData', () => ({ useChannelData: vi.fn() }))
vi.mock('../../../hooks/useChannelLive', () => ({ useChannelLive: vi.fn() }))
vi.mock('../../../hooks/useRailAvatars', () => ({ useRailAvatars: () => ({}) }))
vi.mock('../../../hooks/useYoutubeLive', () => ({ useYoutubeLive: () => ({ available: false, items: [], checking: false }) }))
vi.mock('../../rail/YoutubeRailSection', () => ({ default: () => null }))
vi.mock('../../chat/useChatPopout', () => ({ useChatPopout: () => ({ isOpen: false, blocked: false, open: vi.fn(), close: vi.fn() }) }))
vi.mock('../../chat/ChatDock', () => ({ default: ({ player }: { player: ReactNode }) => <div>{player}</div> }))
vi.mock('../../player/PlayerHost', () => ({ default: () => <div /> }))
vi.mock('../../channel/ProfileSidebar', () => ({ default: () => <div /> }))
vi.mock('../../channel/ChannelStatsSlot', () => ({ default: () => <div /> }))
vi.mock('../../channel/StatsRow', () => ({ default: () => <div /> }))
vi.mock('../../channel/ClipGrid', () => ({ default: () => <div /> }))
vi.mock('../../channel/VODGrid', () => ({ default: () => <div /> }))
vi.mock('../DebugPanel', () => ({ default: () => <div /> }))

type Options = { handleAuthError?: () => void } | undefined

const followsResult = {
  data: [],
  totalCount: 0,
  loadedCount: 0,
  liveCount: 0,
  loading: false,
  loadingMore: false,
  error: null,
  cursor: null,
  refetch: vi.fn(),
  refreshLive: vi.fn(),
  loadMore: vi.fn(),
}

/** Reads the signed-in state out of the real context. */
const seen: { auth: ReturnType<typeof useApp>['state']['auth'] | null } = { auth: null }
function Probe() {
  const { auth } = useApp().state
  useEffect(() => {
    seen.auth = auth
  })
  return null
}

function mount(node: ReactNode) {
  return render(
    <AppProvider>
      <MemoryRouter>
        <Probe />
        {node}
      </MemoryRouter>
    </AppProvider>,
  )
}

/** The callback a component handed to its data hook, taken from that hook's last call. */
function lastOptions(mock: { mock: { calls: unknown[][] } }, argIndex: number): Options {
  const calls = mock.mock.calls
  return calls[calls.length - 1]?.[argIndex] as Options
}

function expectSignedOutByCallback(options: Options) {
  expect(seen.auth?.isAuthenticated).toBe(true)
  expect(options?.handleAuthError).toBeTypeOf('function')
  act(() => options?.handleAuthError?.())
  expect(seen.auth?.isAuthenticated).toBe(false)
  expect(seen.auth?.expired).toBe(true)
  expect(localStorage.getItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)).toBeNull()
}

describe('a 401 from the follows, stats, category and channel loaders signs the viewer out', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seen.auth = null
    localStorage.clear()
    localStorage.setItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN, 'tok')
    vi.mocked(useFollowedChannels).mockReturnValue(followsResult)
    vi.mocked(useYourStats).mockReturnValue({
      stats: null,
      loading: false,
      sessionError: null,
      data: null,
      error: null,
    } as unknown as ReturnType<typeof useYourStats>)
    vi.mocked(useCategoryStreams).mockReturnValue({
      game: null,
      streams: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    })
  })

  it('the Following panel', () => {
    mount(<FollowingPanel />)
    expectSignedOutByCallback(lastOptions(vi.mocked(useFollowedChannels), 1))
  })

  it('the channel rail', () => {
    mount(<ChannelRail />)
    expectSignedOutByCallback(lastOptions(vi.mocked(useFollowedChannels), 1))
  })

  it('the Your Stats panel', () => {
    mount(<YourStatsPanel />)
    expectSignedOutByCallback(lastOptions(vi.mocked(useYourStats), 2))
  })

  it('the Category panel', () => {
    mount(<CategoryPanel />)
    expectSignedOutByCallback(lastOptions(vi.mocked(useCategoryStreams), 2))
  })

  it('the Twitch channel page', () => {
    mount(<TwitchPlayerPage />)
    expectSignedOutByCallback(lastOptions(vi.mocked(useChannelData), 1))
  })
})
