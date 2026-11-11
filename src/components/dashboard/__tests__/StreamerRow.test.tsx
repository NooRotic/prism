import { render, screen, within } from '@testing-library/react'
import StreamerRow from '../StreamerRow'
import type { TrackerSummary } from '../../../lib/twitchTracker'

const TRACKER: TrackerSummary = {
  rank: 18402,
  minutesStreamed: 2460,
  avgViewers: 86,
  maxViewers: 312,
  hoursWatched: 3500,
  followersGained: 96,
  followersTotal: 1284,
}

interface RowOverrides {
  followers?: number | null
  subscribers?: number | null
  tracker?: TrackerSummary | null
  trackerLoading?: boolean
  trackerUnavailable?: boolean
}

function renderRow({
  followers = 1284,
  subscribers = 37,
  tracker = TRACKER,
  trackerLoading = false,
  trackerUnavailable = false,
}: RowOverrides = {}) {
  return render(
    <StreamerRow
      followers={followers}
      subscribers={subscribers}
      tracker={tracker}
      trackerLoading={trackerLoading}
      trackerUnavailable={trackerUnavailable}
      login="yourname"
    />,
  )
}

function chip(label: string): HTMLElement {
  const found = screen.getByText(label, { selector: 'small' }).closest('li')
  if (!found) throw new Error(`no chip labelled ${label}`)
  return found
}

const LABELS = [
  'Rank',
  'Followers',
  'Subscribers',
  'Avg viewers',
  'Peak viewers',
  'Hours streamed',
  'Hours watched',
  'Followers gained',
]
const TT_LABELS = ['Rank', 'Avg viewers', 'Peak viewers', 'Hours streamed', 'Hours watched', 'Followers gained']

describe('StreamerRow', () => {
  it('lists the chips in order, Rank first', () => {
    const { container } = renderRow()

    const labels = [...container.querySelectorAll('li small')].map((el) => el.textContent)
    expect(labels).toEqual(LABELS)
  })

  it('shows each figure the way the mockup does', () => {
    renderRow()

    expect(within(chip('Rank')).getByText('#18,402')).toBeInTheDocument()
    expect(within(chip('Followers')).getByText('1,284')).toBeInTheDocument()
    expect(within(chip('Subscribers')).getByText('37')).toBeInTheDocument()
    expect(within(chip('Avg viewers')).getByText('86')).toBeInTheDocument()
    expect(within(chip('Peak viewers')).getByText('312')).toBeInTheDocument()
    expect(within(chip('Hours streamed')).getByText('41h')).toBeInTheDocument()
    expect(within(chip('Hours watched')).getByText('3.5k')).toBeInTheDocument()
    expect(within(chip('Followers gained')).getByText('+96')).toBeInTheDocument()
  })

  it('shows half hours, and a loss or no change in followers', () => {
    const first = renderRow({ tracker: { ...TRACKER, minutesStreamed: 2490, followersGained: -12 } })
    expect(within(chip('Hours streamed')).getByText('41.5h')).toBeInTheDocument()
    expect(within(chip('Followers gained')).getByText('-12')).toBeInTheDocument()
    first.unmount()

    renderRow({ tracker: { ...TRACKER, followersGained: 0 } })
    expect(within(chip('Followers gained')).getByText('+0')).toBeInTheDocument()
  })

  it('tags every TwitchTracker chip with TT and a tooltip, and no Twitch chip', () => {
    renderRow()

    for (const label of TT_LABELS) {
      expect(within(chip(label)).getByText('TT')).toBeInTheDocument()
      expect(chip(label)).toHaveAttribute('title', 'TwitchTracker, last 30 days')
    }
    expect(within(chip('Followers')).queryByText('TT')).not.toBeInTheDocument()
    expect(within(chip('Subscribers')).queryByText('TT')).not.toBeInTheDocument()
    expect(screen.getAllByText('TT')).toHaveLength(6)
  })

  it('shows a dash, never 0, for the TwitchTracker chips when it has no data, and keeps the Twitch chips', () => {
    renderRow({ tracker: null })

    for (const label of TT_LABELS) {
      expect(within(chip(label)).getByText('–')).toBeInTheDocument()
      expect(within(chip(label)).getByText('TT')).toBeInTheDocument()
    }
    expect(within(chip('Followers')).getByText('1,284')).toBeInTheDocument()
    expect(within(chip('Subscribers')).getByText('37')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('shows a dash for just the field TwitchTracker did not give', () => {
    renderRow({ tracker: { ...TRACKER, avgViewers: null } })

    expect(within(chip('Avg viewers')).getByText('–')).toBeInTheDocument()
    expect(within(chip('Peak viewers')).getByText('312')).toBeInTheDocument()
  })

  it('shows an ellipsis in the TwitchTracker chips while it loads, with the same labels', () => {
    const { container } = renderRow({ tracker: null, trackerLoading: true })

    for (const label of TT_LABELS) {
      expect(within(chip(label)).getByText('…')).toBeInTheDocument()
      expect(within(chip(label)).queryByText('–')).not.toBeInTheDocument()
    }
    expect([...container.querySelectorAll('li small')].map((el) => el.textContent)).toEqual(LABELS)
  })

  it('shows a dash for a Twitch figure that is not available', () => {
    renderRow({ followers: null, subscribers: null })

    expect(within(chip('Followers')).getByText('–')).toBeInTheDocument()
    expect(within(chip('Subscribers')).getByText('–')).toBeInTheDocument()
  })

  it('shows a Twitch figure of zero as 0', () => {
    renderRow({ subscribers: 0 })

    expect(within(chip('Subscribers')).getByText('0')).toBeInTheDocument()
  })

  it('says in the header that TT figures come from twitchtracker.com, and links the channel there', () => {
    renderRow()

    const link = screen.getByRole('link', { name: 'twitchtracker.com' })
    expect(link).toHaveAttribute('href', 'https://twitchtracker.com/yourname')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText(/marked TT/i)).toBeInTheDocument()
  })

  it('says the 30-day figures appear once TwitchTracker tracks the channel when it has no data', () => {
    renderRow({ tracker: null })

    expect(screen.getByText(/appear here once/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TwitchTracker' })).toHaveAttribute(
      'href',
      'https://twitchtracker.com/yourname',
    )
  })

  // No answer is not the same fact as "does not track you": saying the second when only the first
  // happened could send a tracked streamer off to twitchtracker.com to get tracked.
  it('says the figures are unavailable, not that the channel is untracked, when no answer could be had', () => {
    renderRow({ tracker: null, trackerUnavailable: true })

    expect(screen.getByText(/figures are unavailable right now/i)).toBeInTheDocument()
    expect(screen.getByText(/reload to try again/i)).toBeInTheDocument()
    expect(screen.queryByText(/appear here once/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'TwitchTracker' })).toHaveAttribute(
      'href',
      'https://twitchtracker.com/yourname',
    )
  })

  it('still shows dashes in the TwitchTracker chips and the Twitch chips when it is unavailable', () => {
    renderRow({ tracker: null, trackerUnavailable: true })

    for (const label of TT_LABELS) expect(within(chip(label)).getByText('–')).toBeInTheDocument()
    expect(within(chip('Followers')).getByText('1,284')).toBeInTheDocument()
  })

  it('keeps the untracked wording when TwitchTracker answered with nothing', () => {
    renderRow({ tracker: null, trackerUnavailable: false })

    expect(screen.getByText(/appear here once/i)).toBeInTheDocument()
    expect(screen.queryByText(/unavailable right now/i)).not.toBeInTheDocument()
  })

  it('shows the normal note, not the unavailable one, while TwitchTracker is loading', () => {
    renderRow({ tracker: null, trackerLoading: true, trackerUnavailable: true })

    expect(screen.queryByText(/unavailable right now/i)).not.toBeInTheDocument()
    expect(screen.getByText(/marked TT/i)).toBeInTheDocument()
  })

  it('does not claim the channel is untracked while TwitchTracker is still loading', () => {
    renderRow({ tracker: null, trackerLoading: true })

    expect(screen.queryByText(/appear here once/i)).not.toBeInTheDocument()
  })

  // jsdom has no layout, so the reserved height is pinned by its class: loading, no data and
  // data all give every chip the same minimum height, so the page does not jump.
  it('gives every chip the same minimum height in every state', () => {
    for (const overrides of [{}, { tracker: null }, { tracker: null, trackerLoading: true }]) {
      const { container, unmount } = renderRow(overrides)
      const items = [...container.querySelectorAll('li')]
      expect(items).toHaveLength(8)
      for (const item of items) expect(item).toHaveClass('min-h-[52px]')
      unmount()
    }
  })

  it('names the list for assistive technology', () => {
    renderRow()

    expect(screen.getByRole('list', { name: 'Your channel stats' })).toBeInTheDocument()
  })
})
