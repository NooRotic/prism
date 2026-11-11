import { render, screen, within } from '@testing-library/react'
import ThirtyDayPanels from '../ThirtyDayPanels'
import type { Section } from '../../../hooks/streamerSection'
import type { FollowerHistory, VideoHistory } from '../../../hooks/useStreamerHistory'
import { localDayKey, type DayBucket } from '../../../lib/historyStats'
import type { TrackerSummary } from '../../../lib/twitchTracker'

const NOW = new Date(2026, 10, 11, 15, 30, 0).getTime()
const DAY = 24 * 60 * 60 * 1000
const WINDOW_START = new Date(2026, 9, 13).getTime() // 30 local days ending today

/** 30 day buckets ending today; `overrides` is keyed by index from the oldest day. */
function dayBuckets(fill: number | null, overrides: Record<number, number | null> = {}): DayBucket[] {
  return Array.from({ length: 30 }, (_, i) => {
    const at = new Date(2026, 9, 13 + i).getTime()
    return { day: localDayKey(at), at, value: i in overrides ? overrides[i] : fill }
  })
}

const ok = <T,>(data: T): Section<T> => ({ data, loading: false, error: null })
const loadingSection = <T,>(): Section<T> => ({ data: null, loading: true, error: null })
const failed = <T,>(error = 'Twitch API error: 500'): Section<T> => ({ data: null, loading: false, error })

function followerHistory(overrides: Partial<FollowerHistory> = {}): FollowerHistory {
  return {
    buckets: dayBuckets(0, { 28: 3, 29: 2 }),
    total: 1284,
    reachedCap: false,
    source: 'twitch',
    ...overrides,
  }
}

function videoHistory(overrides: Partial<VideoHistory> = {}): VideoHistory {
  return {
    views: Array.from({ length: 14 }, (_, i) => ({ at: WINDOW_START + (i * 2 + 1) * DAY, value: 10 + i })),
    hours: dayBuckets(0, { 27: 5, 29: 7.5 }),
    coverageDays: 30,
    source: 'twitch',
    ...overrides,
  }
}

const TRACKER: TrackerSummary = {
  rank: 18402,
  minutesStreamed: 2460,
  avgViewers: 86,
  maxViewers: 312,
  hoursWatched: 3500,
  followersGained: 96,
  followersTotal: 1284,
}

interface PanelProps {
  followers?: Section<FollowerHistory>
  videos?: Section<VideoHistory>
  tracker?: TrackerSummary | null
}

function renderPanels({
  followers = ok(followerHistory()),
  videos = ok(videoHistory()),
  tracker = TRACKER,
}: PanelProps = {}) {
  return render(<ThirtyDayPanels followers={followers} videos={videos} tracker={tracker} now={NOW} />)
}

const panel = (name: string) => screen.getByRole('region', { name })

describe('ThirtyDayPanels', () => {
  it('has three panels under a Last 30 days heading', () => {
    renderPanels()

    expect(screen.getByRole('heading', { name: 'Last 30 days' })).toBeInTheDocument()
    expect(panel('Followers')).toBeInTheDocument()
    expect(panel('Views per stream')).toBeInTheDocument()
    expect(panel('Time streamed')).toBeInTheDocument()
  })

  describe('Followers', () => {
    it("takes the big number from TwitchTracker and tags it TT", () => {
      renderPanels()

      expect(within(panel('Followers')).getByText('+96')).toBeInTheDocument()
      expect(within(panel('Followers')).getByText('TT')).toBeInTheDocument()
    })

    it('falls back to the sum of the bars, without the TT tag, when TwitchTracker has no data', () => {
      renderPanels({ tracker: null })

      expect(within(panel('Followers')).getByText('+5')).toBeInTheDocument()
      expect(within(panel('Followers')).queryByText('TT')).not.toBeInTheDocument()
    })

    it('shows a TwitchTracker figure of zero as +0, not as a missing figure', () => {
      renderPanels({ tracker: { ...TRACKER, followersGained: 0 } })

      expect(within(panel('Followers')).getByText('+0')).toBeInTheDocument()
    })

    it('names the chart with the figure and the span', () => {
      renderPanels()

      expect(
        screen.getByRole('img', { name: 'Followers gained per day, last 30 days, total 96' }),
      ).toBeInTheDocument()
    })

    it('uses the sum of the bars in the chart name when TwitchTracker has no data', () => {
      renderPanels({ tracker: null })

      expect(
        screen.getByRole('img', { name: 'Followers gained per day, last 30 days, total 5' }),
      ).toBeInTheDocument()
    })

    it('says the bars show gains only', () => {
      renderPanels()

      expect(within(panel('Followers')).getByText(/gains only/i)).toBeInTheDocument()
    })

    it('says the bars cover only the span reached when the follower read hit its cap', () => {
      const capped = followerHistory({
        reachedCap: true,
        buckets: dayBuckets(null, { 24: 4, 25: 3, 26: 2, 27: 1, 28: 0, 29: 2 }),
      })
      renderPanels({ followers: ok(capped), tracker: null })

      expect(within(panel('Followers')).getByText(/cover only the span reached/i)).toBeInTheDocument()
      expect(within(panel('Followers')).getByText(/since Nov 6/)).toBeInTheDocument()
      expect(screen.getByRole('img', { name: /Followers gained per day, since Nov 6, total 12/ })).toBeInTheDocument()
    })

    it('does not mention the cap when the read was complete', () => {
      renderPanels()

      expect(screen.queryByText(/cover only the span reached/i)).not.toBeInTheDocument()
    })

    it('shows a dash and its own message when the followers could not be loaded, and no chart', () => {
      renderPanels({ followers: failed(), tracker: null })

      expect(within(panel('Followers')).getByText('–')).toBeInTheDocument()
      expect(within(panel('Followers')).getByText(/couldn.t load/i)).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Followers gained per day/ })).not.toBeInTheDocument()
    })

    it('still shows the TwitchTracker figure when only the follower history failed', () => {
      renderPanels({ followers: failed() })

      expect(within(panel('Followers')).getByText('+96')).toBeInTheDocument()
      expect(within(panel('Followers')).getByText(/couldn.t load/i)).toBeInTheDocument()
    })

    it('shows an ellipsis while the followers load', () => {
      renderPanels({ followers: loadingSection(), tracker: null })

      expect(within(panel('Followers')).getByText('…')).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Followers gained per day/ })).not.toBeInTheDocument()
    })
  })

  describe('Views per stream', () => {
    it('counts the broadcasts and says recordings keep gaining views', () => {
      renderPanels()

      expect(within(panel('Views per stream')).getByText('14 streams')).toBeInTheDocument()
      expect(within(panel('Views per stream')).getByText(/keep gaining views/i)).toBeInTheDocument()
    })

    it('says 1 stream for a single broadcast', () => {
      renderPanels({ videos: ok(videoHistory({ views: [{ at: WINDOW_START + DAY, value: 3 }] })) })

      expect(within(panel('Views per stream')).getByText('1 stream')).toBeInTheDocument()
    })

    it('names the chart with the figure and the span', () => {
      renderPanels()

      expect(screen.getByRole('img', { name: 'Views per broadcast, last 30 days, 14 broadcasts' })).toBeInTheDocument()
    })

    it('says how far back the recordings go when that is under 30 days', () => {
      renderPanels({ videos: ok(videoHistory({ coverageDays: 9 })) })

      expect(within(panel('Views per stream')).getByText(/recordings go back 9 days/i)).toBeInTheDocument()
      expect(within(panel('Time streamed')).getByText(/recordings go back 9 days/i)).toBeInTheDocument()
    })

    it('does not say it when the recordings cover the 30 days', () => {
      renderPanels({ videos: ok(videoHistory({ coverageDays: 45 })) })

      expect(screen.queryByText(/recordings go back/i)).not.toBeInTheDocument()
    })

    it('shows an empty-state line instead of a flat chart when there are no recordings at all', () => {
      const none = videoHistory({ views: [], hours: dayBuckets(null), coverageDays: null })
      renderPanels({ videos: ok(none), tracker: null })

      expect(within(panel('Views per stream')).getByText(/no recordings/i)).toBeInTheDocument()
      expect(within(panel('Time streamed')).getByText(/no recordings/i)).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Views per broadcast/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Hours streamed per day/ })).not.toBeInTheDocument()
    })

    it('shows a dash and its own message when the recordings could not be loaded', () => {
      renderPanels({ videos: failed(), tracker: null })

      expect(within(panel('Views per stream')).getByText('–')).toBeInTheDocument()
      expect(within(panel('Views per stream')).getByText(/couldn.t load/i)).toBeInTheDocument()
      expect(screen.queryByRole('img', { name: /Views per broadcast/ })).not.toBeInTheDocument()
    })
  })

  describe('Time streamed', () => {
    it('takes the big number from TwitchTracker minutes and tags it TT', () => {
      renderPanels()

      expect(within(panel('Time streamed')).getByText('41h')).toBeInTheDocument()
      expect(within(panel('Time streamed')).getByText('TT')).toBeInTheDocument()
    })

    it('falls back to the sum of the bars, without the TT tag, when TwitchTracker has no data', () => {
      renderPanels({ tracker: null })

      expect(within(panel('Time streamed')).getByText('12.5h')).toBeInTheDocument()
      expect(within(panel('Time streamed')).queryByText('TT')).not.toBeInTheDocument()
    })

    it('names the chart with the figure and the span', () => {
      renderPanels()

      expect(
        screen.getByRole('img', { name: 'Hours streamed per day, last 30 days, total 41 hours' }),
      ).toBeInTheDocument()
    })

    it('keeps the TwitchTracker figure when only the recordings failed', () => {
      renderPanels({ videos: failed() })

      expect(within(panel('Time streamed')).getByText('41h')).toBeInTheDocument()
      expect(within(panel('Time streamed')).getByText(/couldn.t load/i)).toBeInTheDocument()
    })
  })

  it('lets one section fail while the others render', () => {
    renderPanels({ followers: failed(), tracker: null })

    expect(within(panel('Views per stream')).getByText('14 streams')).toBeInTheDocument()
    expect(within(panel('Time streamed')).getByText('12.5h')).toBeInTheDocument()
  })

  it('draws the three charts over the same 30 days', () => {
    renderPanels()

    expect(screen.getAllByText('Oct 13')).toHaveLength(3)
    expect(screen.getAllByText('Nov 11')).toHaveLength(3)
  })

  it('says which numbers come from TwitchTracker and which shapes come from Twitch', () => {
    renderPanels()

    expect(screen.getByText(/tagged TT are from TwitchTracker/i)).toBeInTheDocument()
  })

  // jsdom has no layout, so the stacking on a phone is pinned by its classes.
  it('stacks the panels in one column on a phone and puts them side by side from md up', () => {
    renderPanels()

    expect(panel('Followers').parentElement).toHaveClass('grid-cols-1', 'md:grid-cols-3')
  })
})
