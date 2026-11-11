import ClipGrid from './ClipGrid'
import ChannelStatsSlot from './ChannelStatsSlot'
import ProfileSidebar from './ProfileSidebar'
import StatsRow from './StatsRow'
import VODGrid from './VODGrid'
import DebugPanel from '../layout/DebugPanel'

const SECTION = 'fill-hide max-w-[1600px] mx-auto w-full'

/**
 * Everything on a channel page below the player and chat: the profile, the stats slot, the four
 * cards, the debug panel, then the clips and VODs. The same in the live layout and the offline
 * one. Each section carries `fill-hide` so fill mode can hide it.
 */
export default function ChannelBody({ channel }: { channel: string | undefined }) {
  return (
    <div className="fill-hide flex flex-col gap-4">
      <div className={SECTION}>
        <ProfileSidebar />
      </div>

      {/* Stats: between the profile and the cards. Renders nothing unless this channel has stats. */}
      <ChannelStatsSlot channel={channel} />

      <div className={SECTION}>
        <StatsRow />
      </div>

      <div className={SECTION}>
        <DebugPanel />
      </div>

      {/* Clips + VODs */}
      <div className="fill-hide flex flex-col lg:flex-row gap-4 w-full max-w-[1600px] mx-auto">
        <div className="w-full lg:w-1/2">
          <ClipGrid />
        </div>
        <div className="w-full lg:w-1/2">
          <VODGrid />
        </div>
      </div>
    </div>
  )
}
