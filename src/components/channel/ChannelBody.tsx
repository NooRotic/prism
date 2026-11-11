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
    <div className="@container fill-hide flex flex-col gap-4">
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
      {/* Side by side once the body itself is wide enough (not the window: in the offline layout the
          body is only the left column). The grids inside key off the body's width too, so a half
          gets three columns only when the body is wide enough for halves of about 500px. */}
      <div className="fill-hide flex flex-col @4xl:flex-row gap-4 w-full max-w-[1600px] mx-auto">
        <div className="w-full @4xl:w-1/2">
          <ClipGrid />
        </div>
        <div className="w-full @4xl:w-1/2">
          <VODGrid />
        </div>
      </div>
    </div>
  )
}
