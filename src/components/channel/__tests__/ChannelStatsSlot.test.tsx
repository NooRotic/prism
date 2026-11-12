import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../../../contexts/AppContext'
import { useChannelHistory } from '../../../hooks/useChannelHistory'
import type { ChannelHistoryState } from '../../../hooks/useChannelHistory'
import { useStreamerStats } from '../../../hooks/useStreamerStats'
import type { StreamerStats } from '../../../hooks/useStreamerStats'
import type { ChannelHistory, HistoryRow } from '../../../lib/historyApi'
import type { TwitchUser } from '../../../types/twitch'
import ChannelStatsSlot from '../ChannelStatsSlot'

vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../../hooks/useSessionExpiry', () => ({ useSessionExpiry: () => onSessionExpired }))
vi.mock('../../dashboard/useNow', () => ({ useNow: () => Date.UTC(2026, 10, 11, 12) }))
vi.mock('../../../hooks/useStreamerStats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useStreamerStats')>()),
  useStreamerStats: vi.fn(),
}))

vi.mock('../../../hooks/useChannelHistory', () => ({ useChannelHistory: vi.fn() }))

const onSessionExpired = vi.fn()
const mockApp = vi.mocked(useApp)
const mockStats = vi.mocked(useStreamerStats)
const mockHistory = vi.mocked(useChannelHistory)

const historyRow = (date: string, followersTotal: number): HistoryRow => ({
  date,
  rank: 100,
  minutesStreamed: 600,
  avgViewers: 50,
  maxViewers: 90,
  hoursWatched: 1200,
  followersChange: 10,
  followersTotal,
  ttStatus: 'ok',
})

const serverHistory: ChannelHistory = {
  login: 'streamer',
  displayName: 'Streamer',
  avatarUrl: null,
  broadcasterType: 'affiliate',
  language: 'en',
  category: null,
  trackedSince: '2026-11-09',
  lastUpdated: '2026-11-12T03:00:00Z',
  ttStatus: 'ok',
  bioLinks: [],
  latest: historyRow('2026-11-12', 1030),
  history: [historyRow('2026-11-09', 1000), historyRow('2026-11-10', 1010), historyRow('2026-11-11', 1020), historyRow('2026-11-12', 1030)],
}
const historyReady: ChannelHistoryState = { status: 'ready', data: serverHistory }

const user = (login: string, broadcaster_type: TwitchUser['broadcaster_type']) =>
  ({ id: '42', login, broadcaster_type }) as TwitchUser

const loading = { data: null, loading: true, error: null }
const stats: StreamerStats = {
  tracker: { summary: null, loading: true, unavailable: false },
  numbers: { followers: loading, subscribers: loading },
  history: { followers: loading, videos: loading },
}

function signedInAs(u: TwitchUser | null) {
  mockApp.mockReturnValue({ state: { auth: { user: u } }, dispatch: vi.fn() } as never)
}

describe('ChannelStatsSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStats.mockReturnValue(stats)
    mockHistory.mockReturnValue({ status: 'idle' })
  })

  it("shows the streamer row and 30-day panels on the viewer's own affiliate channel", () => {
    signedInAs(user('streamer', 'affiliate'))
    render(<ChannelStatsSlot channel="Streamer" />)
    expect(screen.getByRole('region', { name: 'Your channel' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Last 30 days panels' })).toBeInTheDocument()
    expect(mockStats).toHaveBeenLastCalledWith(expect.objectContaining({ login: 'streamer' }), true, onSessionExpired)
  })

  it('shows nothing, and makes no request, on another channel', () => {
    signedInAs(user('streamer', 'affiliate'))
    const { container } = render(<ChannelStatsSlot channel="someoneelse" />)
    expect(container).toBeEmptyDOMElement()
    expect(mockStats).toHaveBeenLastCalledWith(expect.anything(), false, onSessionExpired)
  })

  it("shows nothing on the viewer's own channel when they are not an affiliate or partner", () => {
    signedInAs(user('streamer', ''))
    const { container } = render(<ChannelStatsSlot channel="streamer" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows nothing when no profile is known', () => {
    signedInAs(null)
    const { container } = render(<ChannelStatsSlot channel="streamer" />)
    expect(container).toBeEmptyDOMElement()
    expect(mockStats).toHaveBeenLastCalledWith(null, false, onSessionExpired)
  })

  it('shows nothing without a route channel', () => {
    signedInAs(user('streamer', 'partner'))
    const { container } = render(<ChannelStatsSlot channel={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  describe('with the history server', () => {
    it('shows the full history block on another channel when the server has it', () => {
      signedInAs(user('streamer', 'affiliate'))
      mockHistory.mockReturnValue(historyReady)
      render(<ChannelStatsSlot channel="someoneelse" />)

      expect(screen.getByRole('region', { name: 'Channel history' })).toBeInTheDocument()
      expect(screen.getByRole('list', { name: 'Channel stats' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Your channel' })).not.toBeInTheDocument()
      expect(mockStats).toHaveBeenLastCalledWith(expect.anything(), false, onSessionExpired)
    })

    it('shows it to a signed-out viewer', () => {
      signedInAs(null)
      mockHistory.mockReturnValue(historyReady)
      render(<ChannelStatsSlot channel="streamer" />)

      expect(screen.getByRole('region', { name: 'Channel history' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'TwitchTracker' })).toHaveAttribute('href', 'https://twitchtracker.com/streamer')
    })

    it("shows only the charts, not a second row of TwitchTracker numbers, on the viewer's own streamer channel", () => {
      signedInAs(user('streamer', 'affiliate'))
      mockHistory.mockReturnValue(historyReady)
      render(<ChannelStatsSlot channel="streamer" />)

      expect(screen.getByRole('region', { name: 'Your channel' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Last 30 days panels' })).toBeInTheDocument()
      const block = screen.getByRole('region', { name: 'Channel history' })
      expect(screen.queryByRole('list', { name: 'Channel stats' })).not.toBeInTheDocument()
      expect(within(block).getAllByRole('img')).toHaveLength(4)
    })

    it("puts the history block after the viewer's own streamer block", () => {
      signedInAs(user('streamer', 'partner'))
      mockHistory.mockReturnValue(historyReady)
      render(<ChannelStatsSlot channel="streamer" />)

      const panels = screen.getByRole('region', { name: 'Last 30 days panels' })
      const block = screen.getByRole('region', { name: 'Channel history' })
      expect(panels.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })

    it("shows the full history block on the viewer's own channel when they are not an affiliate or partner", () => {
      signedInAs(user('streamer', ''))
      mockHistory.mockReturnValue(historyReady)
      render(<ChannelStatsSlot channel="streamer" />)

      expect(screen.getByRole('list', { name: 'Channel stats' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Your channel' })).not.toBeInTheDocument()
    })

    it.each<ChannelHistoryState>([{ status: 'idle' }, { status: 'loading' }, { status: 'untracked' }, { status: 'unavailable' }])(
      'shows nothing, not even an empty box, while the history is %j',
      (state) => {
        signedInAs(user('streamer', 'affiliate'))
        mockHistory.mockReturnValue(state)
        const { container } = render(<ChannelStatsSlot channel="someoneelse" />)

        expect(container).toBeEmptyDOMElement()
      },
    )

    it("still shows the streamer block on the viewer's own channel when the history is unavailable", () => {
      signedInAs(user('streamer', 'affiliate'))
      mockHistory.mockReturnValue({ status: 'unavailable' })
      render(<ChannelStatsSlot channel="streamer" />)

      expect(screen.getByRole('region', { name: 'Your channel' })).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Channel history' })).not.toBeInTheDocument()
    })

    it.each([['Streamer'], ['someoneelse'], [undefined]])('asks the history hook about the route channel %s', (channel) => {
      signedInAs(user('streamer', 'affiliate'))
      render(<ChannelStatsSlot channel={channel} />)

      expect(mockHistory).toHaveBeenLastCalledWith(channel)
    })
  })
})
