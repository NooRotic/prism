import { render, screen, within } from '@testing-library/react'
import type { ChannelHistoryState } from '../../../hooks/useChannelHistory'
import type { ChannelHistory, HistoryRow } from '../../../lib/historyApi'
import { compactCount } from '../../../lib/dashboardStats'
import { ROLLING_TITLES } from '../../../lib/historyGrowth'
import { formatHours, formatRank, formatSigned, formatWhole } from '../../../lib/streamerFormat'
import HistoryBlock from '../HistoryBlock'

const DAY = 24 * 60 * 60 * 1000
const END = Date.UTC(2026, 10, 12)
const UPDATED = '2026-11-12T03:00:00Z'
const NOW = Date.parse('2026-11-12T12:00:00Z')

function row(daysBeforeEnd: number, over: Partial<HistoryRow> = {}): HistoryRow {
  const age = daysBeforeEnd
  return {
    date: new Date(END - age * DAY).toISOString().slice(0, 10),
    rank: 217 + age,
    minutesStreamed: 5658,
    avgViewers: 7372,
    maxViewers: 14676,
    hoursWatched: 695155,
    followersChange: -3745,
    followersTotal: 11_292_376 - age * 10,
    ttStatus: 'ok',
    ...over,
  }
}

/** `days` consecutive rows ending on 2026-11-12, oldest first: followers +10 a day, rank improving by 1 a day. */
function rows(days: number): HistoryRow[] {
  return Array.from({ length: days }, (_, i) => row(days - 1 - i))
}

function channel(history: HistoryRow[], over: Partial<ChannelHistory> = {}): ChannelHistory {
  return {
    login: 'alice',
    displayName: 'Alice',
    avatarUrl: null,
    broadcasterType: 'partner',
    language: 'en',
    category: 'Just Chatting',
    trackedSince: history[0]?.date ?? '2026-11-12',
    lastUpdated: UPDATED,
    ttStatus: 'ok',
    bioLinks: [],
    latest: history.length > 0 ? history[history.length - 1] : null,
    history,
    ...over,
  }
}

const ready = (data: ChannelHistory): ChannelHistoryState => ({ status: 'ready', data })

function panel(name: string | RegExp): HTMLElement {
  return screen.getByRole('region', { name })
}

describe('HistoryBlock', () => {
  it.each<ChannelHistoryState>([{ status: 'idle' }, { status: 'loading' }, { status: 'untracked' }, { status: 'unavailable' }])(
    'renders nothing for %j',
    (state) => {
      const { container } = render(<HistoryBlock state={state} now={NOW} />)

      expect(container).toBeEmptyDOMElement()
    },
  )

  it('shows the chips from the latest row using the shared formatters', () => {
    render(<HistoryBlock state={ready(channel(rows(5)))} now={NOW} />)

    const items = within(screen.getByRole('list', { name: 'Channel stats' })).getAllByRole('listitem')
    const text = items.map((li) => li.textContent ?? '')
    const has = (label: string, value: string) => text.some((t) => t.includes(label) && t.includes(value))
    expect(has('Rank', formatRank(217))).toBe(true)
    expect(has('Followers', formatWhole(11_292_376))).toBe(true)
    expect(has('Followers gained', formatSigned(-3745))).toBe(true)
    expect(has('Avg viewers', formatWhole(7372))).toBe(true)
    expect(has('Peak viewers', formatWhole(14676))).toBe(true)
    expect(has('Hours streamed', formatHours(5658 / 60))).toBe(true)
    expect(has('Hours watched', compactCount(695155))).toBe(true)
  })

  it('shows a dash, never a 0, for a figure TwitchTracker did not give', () => {
    const history = [row(1), row(0, { maxViewers: null, rank: null })]
    render(<HistoryBlock state={ready(channel(history))} now={NOW} />)

    const items = within(screen.getByRole('list', { name: 'Channel stats' })).getAllByRole('listitem')
    const peak = items.find((li) => li.textContent?.includes('Peak viewers'))
    const rank = items.find((li) => li.textContent?.startsWith('Rank'))
    expect(peak?.textContent).toContain('–')
    expect(rank?.textContent).toContain('–')
  })

  it("credits TwitchTracker with a link to the channel's page", () => {
    render(<HistoryBlock state={ready(channel(rows(5), { login: 'a_b' }))} now={NOW} />)

    const region = screen.getByRole('region', { name: 'Channel history' })
    expect(within(region).getByText(/Data:/)).toBeInTheDocument()
    const link = within(region).getByRole('link', { name: 'TwitchTracker' })
    expect(link).toHaveAttribute('href', 'https://twitchtracker.com/a_b')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('with chartsOnly hides the chips but keeps the credit and the four charts', () => {
    render(<HistoryBlock state={ready(channel(rows(5)))} now={NOW} chartsOnly />)

    expect(screen.queryByRole('list', { name: 'Channel stats' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TwitchTracker' })).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(4)
  })

  it('with chartsOnly and nothing to chart renders nothing', () => {
    const { container } = render(<HistoryBlock state={ready(channel([]))} now={NOW} chartsOnly />)

    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['untracked', 'TwitchTracker does not track this channel yet'],
    ['pending', 'TwitchTracker figures are on their way'],
    ['error', 'TwitchTracker figures are unavailable right now'],
  ] as const)('says so when the TT status is %s', (ttStatus, message) => {
    render(<HistoryBlock state={ready(channel([], { ttStatus, latest: null, lastUpdated: null, trackedSince: '2026-11-12' }))} now={NOW} />)

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByText('Tracking since Nov 12')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Channel stats' })).not.toBeInTheDocument()
  })

  it('says nothing about TT when the status is ok or none', () => {
    render(<HistoryBlock state={ready(channel(rows(5), { ttStatus: 'ok' }))} now={NOW} />)

    expect(screen.queryByText(/TwitchTracker (does not|figures)/)).not.toBeInTheDocument()
  })

  it('shows the stale badge only past 48 hours', () => {
    const data = channel(rows(5), { lastUpdated: '2026-11-10T03:00:00Z' })
    const exactly48h = Date.parse('2026-11-12T03:00:00Z')
    const { rerender } = render(<HistoryBlock state={ready(data)} now={exactly48h} />)
    expect(screen.queryByText(/^Updated .* ago$/)).not.toBeInTheDocument()

    rerender(<HistoryBlock state={ready(data)} now={exactly48h + 60_000} />)
    expect(screen.getByText('Updated 2 days ago')).toBeInTheDocument()
  })

  it('shows Tracking since and no charts with fewer than two points', () => {
    render(<HistoryBlock state={ready(channel(rows(1)))} now={NOW} />)

    expect(screen.getByText('Tracking since Nov 12')).toBeInTheDocument()
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(screen.getAllByText('Chart appears once there are two days of history')).toHaveLength(4)
    expect(within(screen.getByRole('list', { name: 'Channel stats' })).getAllByRole('listitem').length).toBeGreaterThan(0)
  })

  it('titles the viewers and hours charts as rolling 30 days and shows no growth for them', () => {
    render(<HistoryBlock state={ready(channel(rows(40)))} now={NOW} />)

    for (const title of [ROLLING_TITLES.viewers, ROLLING_TITLES.hours]) {
      const section = panel(title)
      expect(within(section).queryByText(/\b(7d|30d|90d)\b/)).not.toBeInTheDocument()
      expect(within(section).getByRole('img', { name: /rolling 30 days/ })).toBeInTheDocument()
    }
  })

  it('shows growth for followers and rank, only for the windows the history reaches', () => {
    render(<HistoryBlock state={ready(channel(rows(40)))} now={NOW} />)

    const followers = panel('Total followers')
    expect(within(followers).getByText(/7d \+70/)).toBeInTheDocument()
    expect(within(followers).getByText(/30d \+300/)).toBeInTheDocument()
    expect(within(followers).queryByText(/90d/)).not.toBeInTheDocument()

    const rank = panel('Rank')
    expect(within(rank).getByText(/7d up 7/)).toBeInTheDocument()
    expect(within(rank).getByText(/30d up 30/)).toBeInTheDocument()
    expect(within(rank).queryByText(/90d/)).not.toBeInTheDocument()
    expect(within(rank).getByText(/lower is better/i)).toBeInTheDocument()
  })

  it('says down when a rank got worse and no change when it did not move', () => {
    const worse = rows(10).map((r, i) => ({ ...r, rank: 100 + i * 3 }))
    const { rerender } = render(<HistoryBlock state={ready(channel(worse))} now={NOW} />)
    expect(within(panel('Rank')).getByText(/7d down 21/)).toBeInTheDocument()

    const still = rows(10).map((r) => ({ ...r, rank: 100 }))
    rerender(<HistoryBlock state={ready(channel(still))} now={NOW} />)
    expect(within(panel('Rank')).getByText(/7d no change/)).toBeInTheDocument()
  })

  it('draws a gap in the history as two lines, not one joined line', () => {
    const history = rows(7).filter((r) => r.date !== '2026-11-09')
    const { container } = render(<HistoryBlock state={ready(channel(history))} now={NOW} />)

    const followersChart = within(panel('Total followers')).getByRole('img')
    expect(followersChart.querySelectorAll('polyline')).toHaveLength(2)
    expect(container.querySelectorAll('polyline').length).toBeGreaterThan(2)
  })

  it('draws the viewers chart with two lines on one scale and names them in text', () => {
    render(<HistoryBlock state={ready(channel(rows(6)))} now={NOW} />)

    const section = panel(ROLLING_TITLES.viewers)
    expect(within(section).getByRole('img').querySelectorAll('polyline')).toHaveLength(2)
    expect(within(section).getByText('Average')).toBeInTheDocument()
    expect(within(section).getByText('Peak')).toBeInTheDocument()
  })

  it("shows each panel's latest figure", () => {
    render(<HistoryBlock state={ready(channel(rows(5)))} now={NOW} />)

    expect(within(panel('Total followers')).getByText(formatWhole(11_292_376))).toBeInTheDocument()
    expect(within(panel('Rank')).getByText(formatRank(217))).toBeInTheDocument()
    expect(within(panel(ROLLING_TITLES.hours)).getByText(compactCount(695155))).toBeInTheDocument()
  })
})
