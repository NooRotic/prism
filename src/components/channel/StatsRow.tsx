import { Film, Clock, Gamepad2, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useClipStats } from '../../hooks/useClipStats'
import { useDerivedStats } from '../../hooks/useDerivedStats'

interface StatCardProps {
  icon: ReactNode
  label: string
  value: string
  details: string[]
  trend?: number // > 1 means up, < 1 means down, 0 or undefined = no trend
}

function StatCard({ icon, label, value, details, trend }: StatCardProps) {
  return (
    <div
      className="flex flex-col gap-2 p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      <div className="flex items-center justify-between">
        {/* Label uses accent-green to match the rest of the app's primary
            accent rather than Twitch purple — purple is now reserved for the
            affiliate badge in ProfileSidebar. */}
        <span className="text-xs uppercase tracking-wider font-bold" style={{ color: 'var(--accent-green)' }}>
          {label}
        </span>
        <div className="flex items-center gap-1">
          {trend !== undefined && trend !== 0 && (
            trend > 1 ? (
              <ArrowUp size={14} style={{ color: 'var(--accent-gold)' }} />
            ) : (
              <ArrowDown size={14} style={{ color: 'var(--accent-gold)' }} />
            )
          )}
          {icon}
        </div>
      </div>
      <p
        className="text-4xl font-bold"
        style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-heading)' }}
      >
        {value}
      </p>
      <div className="flex flex-col gap-0.5">
        {details.map((d, i) => (
          <span key={i} className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {d}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function StatsRow() {
  const { state } = useApp()
  const { clips, videos, channelInfo, games } = state.channel

  const clipStats = useClipStats(clips, games)
  const derivedStats = useDerivedStats({ clips, videos, channelInfo, games })

  const { vodStats, diversity, clipEngagement, growth } = derivedStats

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      {/* Clips */}
      <StatCard
        icon={<Film size={14} style={{ color: 'var(--text-muted)' }} />}
        label="Clips"
        value={clipStats.totalClips.toLocaleString()}
        details={[
          `Top clip: ${clipStats.topClips[0]?.view_count.toLocaleString() ?? '0'} views`,
          `${clipStats.uniqueClippers.toLocaleString()} unique clippers`,
        ]}
        trend={growth.clipCreationRate > 0 ? (growth.clipCreationRate > 5 ? 1.5 : 0.5) : undefined}
      />

      {/* Hours Streamed */}
      <StatCard
        icon={<Clock size={14} style={{ color: 'var(--text-muted)' }} />}
        label="Hours Streamed"
        value={vodStats.totalHoursStreamed.toFixed(1)}
        details={[
          `${vodStats.totalVODs} VODs total`,
          `Avg ${vodStats.avgStreamLength.toFixed(1)}h per stream`,
        ]}
        trend={growth.vodViewTrend}
      />

      {/* Content */}
      <StatCard
        icon={<Gamepad2 size={14} style={{ color: 'var(--text-muted)' }} />}
        label="Content"
        value={diversity.uniqueGames.toLocaleString()}
        details={[
          `${diversity.diversityLabel}`,
          `Across ${diversity.totalVODsAnalyzed} recent VODs`,
        ]}
      />

      {/* Engagement */}
      <StatCard
        icon={<TrendingUp size={14} style={{ color: 'var(--text-muted)' }} />}
        label="Engagement"
        value={clipEngagement.clipsPerStreamHour.toFixed(1)}
        details={[
          `clips/hour`,
          `Avg ${clipEngagement.avgViewsPerClip.toFixed(1)} views/clip`,
        ]}
      />
    </div>
  )
}
