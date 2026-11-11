import type { StreamerStats } from '../../hooks/useStreamerStats'
import StreamerRow from './StreamerRow'
import ThirtyDayPanels from './ThirtyDayPanels'

interface StreamerBlockProps {
  /** The streamer's login, for the TwitchTracker link. */
  login: string
  stats: StreamerStats
  now: number
}

/** The streamer's own channel: the row of stat chips, then the three 30-day panels. Shared by the dashboard and the channel page. */
export default function StreamerBlock({ login, stats, now }: StreamerBlockProps) {
  const { tracker, numbers, history } = stats
  return (
    <>
      <StreamerRow
        followers={numbers.followers.data}
        subscribers={numbers.subscribers.data}
        tracker={tracker.summary}
        trackerLoading={tracker.loading}
        trackerUnavailable={tracker.unavailable}
        login={login}
      />
      <ThirtyDayPanels
        followers={history.followers}
        videos={history.videos}
        tracker={tracker.summary}
        trackerLoading={tracker.loading}
        now={now}
      />
    </>
  )
}
