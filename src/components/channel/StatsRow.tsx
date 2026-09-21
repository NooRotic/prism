import { Film, Clock, Gamepad2, TrendingUp, ArrowUp, ArrowDown, Lock, LogIn } from 'lucide-react'
import type { ReactNode } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useClipStats } from '../../hooks/useClipStats'
import { useDerivedStats } from '../../hooks/useDerivedStats'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'

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

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 p-6 rounded-lg text-center w-full"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--accent-twitch)',
        opacity: 0.7,
      }}
    >
      <Lock size={24} style={{ color: 'var(--accent-twitch)' }} />
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--accent-twitch)' }}
      >
        Channel stats
      </span>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Connect Twitch to see clips, VODs and engagement for this channel
      </p>
      <button
        type="button"
        onClick={onConnect}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.02] mt-1"
        style={{
          background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          letterSpacing: '0.05em',
        }}
      >
        <LogIn size={12} />
        connect twitch
      </button>
    </div>
  )
}

export default function StatsRow() {
  const { state } = useApp()
  const { isAuthenticated, login } = useTwitchAuth()
  const { clips, videos, channelInfo, games } = state.channel

  const clipStats = useClipStats(clips, games)
  const derivedStats = useDerivedStats({ clips, videos, channelInfo, games })

  const { vodStats, diversity, clipEngagement, growth } = derivedStats

  // Helix needs a token on every endpoint, so signed out there is no data
  // to show. Rendering the cards anyway produced "CLIPS 0 / HOURS STREAMED
  // 0.0", which reads as a measurement rather than an absence.
  if (!isAuthenticated) return <ConnectPrompt onConnect={login} />

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
