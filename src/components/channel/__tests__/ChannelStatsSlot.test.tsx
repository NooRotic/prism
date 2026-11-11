import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useApp } from '../../../contexts/AppContext'
import { useStreamerStats } from '../../../hooks/useStreamerStats'
import type { StreamerStats } from '../../../hooks/useStreamerStats'
import type { TwitchUser } from '../../../types/twitch'
import ChannelStatsSlot from '../ChannelStatsSlot'

vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../../hooks/useSessionExpiry', () => ({ useSessionExpiry: () => onSessionExpired }))
vi.mock('../../dashboard/useNow', () => ({ useNow: () => Date.UTC(2026, 10, 11, 12) }))
vi.mock('../../../hooks/useStreamerStats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useStreamerStats')>()),
  useStreamerStats: vi.fn(),
}))

const onSessionExpired = vi.fn()
const mockApp = vi.mocked(useApp)
const mockStats = vi.mocked(useStreamerStats)

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
})
