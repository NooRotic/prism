import { useApp } from '../../contexts/AppContext'
import { useChannelHistory } from '../../hooks/useChannelHistory'
import { useSessionExpiry } from '../../hooks/useSessionExpiry'
import { isStreamerTier, useStreamerStats } from '../../hooks/useStreamerStats'
import StreamerBlock from '../dashboard/StreamerBlock'
import { useNow } from '../dashboard/useNow'
import HistoryBlock from './HistoryBlock'

/**
 * Where a channel page shows its stats, between the profile and the four cards.
 *
 * Any channel the history server tracks gets the history block (TwitchTracker's 30-day numbers and charts that
 * grow day by day), for signed-in and signed-out viewers alike. The viewer's own affiliate or partner channel
 * also keeps its streamer block, with fresh browser-side TwitchTracker numbers and the Twitch-sourced panels;
 * there the history block shows only its charts, so the page never has two rows of the same numbers.
 *
 * With nothing to show (the server is loading, down, or does not track the channel, and no streamer block
 * applies) the slot renders nothing, not even an empty box, so the page's spacing does not change. The slot owns
 * its wrapper for that reason. The history hook is also what reports the visit that starts tracking a channel,
 * so it runs whether or not anything ends up on screen.
 */
export default function ChannelStatsSlot({ channel }: { channel: string | undefined }) {
  const { state } = useApp()
  const onSessionExpired = useSessionExpiry()
  const now = useNow()
  const user = state.auth.user
  const own = user !== null && channel !== undefined && user.login.toLowerCase() === channel.toLowerCase()
  const stats = useStreamerStats(user, own, onSessionExpired)
  const history = useChannelHistory(channel)

  const streamerBlock = user !== null && own && isStreamerTier(user)
  if (!streamerBlock && history.status !== 'ready') return null

  return (
    <div data-testid="channel-stats-slot" className="fill-hide flex flex-col gap-4 max-w-[1600px] mx-auto w-full">
      {streamerBlock && <StreamerBlock login={user.login} stats={stats} now={now} />}
      <HistoryBlock state={history} now={now} chartsOnly={streamerBlock} />
    </div>
  )
}
