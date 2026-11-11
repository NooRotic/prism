import { useApp } from '../../contexts/AppContext'
import { useSessionExpiry } from '../../hooks/useSessionExpiry'
import { isStreamerTier, useStreamerStats } from '../../hooks/useStreamerStats'
import StreamerBlock from '../dashboard/StreamerBlock'
import { useNow } from '../dashboard/useNow'

/**
 * Where a channel page shows its stats, between the profile and the four cards. For now only the
 * viewer's own channel has any (the streamer row and 30-day panels); every other channel renders
 * nothing, not even an empty box, so the page's spacing does not change. The slot owns its
 * wrapper for that reason.
 */
export default function ChannelStatsSlot({ channel }: { channel: string | undefined }) {
  const { state } = useApp()
  const onSessionExpired = useSessionExpiry()
  const now = useNow()
  const user = state.auth.user
  const own = user !== null && channel !== undefined && user.login.toLowerCase() === channel.toLowerCase()
  const stats = useStreamerStats(user, own, onSessionExpired)

  if (user === null || !own || !isStreamerTier(user)) return null
  return (
    <div data-testid="channel-stats-slot" className="fill-hide flex flex-col gap-4 max-w-[1600px] mx-auto w-full">
      <StreamerBlock login={user.login} stats={stats} now={now} />
    </div>
  )
}
