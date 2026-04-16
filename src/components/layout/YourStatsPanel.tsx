import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import SlidedownPanel from './SlidedownPanel'
import {
  X,
  Loader2,
  Users,
  Star,
  Target,
  Crown,
  TrendingUp,
  BarChart3,
  Sparkles,
  Coins,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useYourStats } from '../../hooks/useYourStats'
import type { SectionState } from '../../hooks/useYourStats'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import type {
  TwitchGoal,
  TwitchPoll,
  TwitchPrediction,
  TwitchHypeTrainEvent,
} from '../../types/twitch'

// ─── Shared card wrapper ──────────────────────────────────────────────
// Every stat section uses the same outer shell so loading/error/empty
// presentation stays uniform. Individual cards pass their unique body
// via children when data is present.

interface StatCardProps<T> {
  title: string
  icon: ReactNode
  section: SectionState<T>
  /** Rendered when section.data is non-null and non-empty. */
  children: (data: T) => ReactNode
  /** Optional: extra text shown when section has no data. */
  emptyMessage?: string
  /** Whether to span 2 columns on md+ (for wider cards). */
  wide?: boolean
}

function StatCard<T>({
  title,
  icon,
  section,
  children,
  emptyMessage = 'None',
  wide = false,
}: StatCardProps<T>) {
  const isEmpty =
    section.data === null ||
    (Array.isArray(section.data) && section.data.length === 0)

  return (
    <div
      className={`flex flex-col gap-1.5 p-3 rounded-lg ${wide ? 'md:col-span-2' : ''}`}
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0" style={{ color: 'var(--accent-green)' }}>
          {icon}
        </span>
        <span
          className="text-xs uppercase tracking-wider font-bold"
          style={{ color: 'var(--accent-green)' }}
        >
          {title}
        </span>
      </div>

      {section.loading && (
        <div
          className="flex items-center gap-2 py-1"
          style={{ color: 'var(--text-muted)' }}
        >
          <Loader2
            size={14}
            className="animate-spin"
            style={{ color: 'var(--accent-green)' }}
          />
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {!section.loading && section.error && (
        <div
          className="flex items-start gap-2 text-xs"
          style={{ color: 'var(--accent-red)' }}
        >
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <span className="break-words">{section.error}</span>
        </div>
      )}

      {!section.loading && !section.error && isEmpty && (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {emptyMessage}
        </p>
      )}

      {!section.loading &&
        !section.error &&
        !isEmpty &&
        section.data !== null &&
        children(section.data)}
    </div>
  )
}

// ─── Individual card bodies ──────────────────────────────────────────

function FollowerCountBody({ count }: { count: number }) {
  return (
    <p
      className="text-2xl font-bold"
      style={{
        color: 'var(--accent-green)',
        fontFamily: 'var(--font-heading)',
      }}
    >
      {count.toLocaleString()}
    </p>
  )
}

interface SubscriberBodyData {
  total: number
  points: number
  recent: Array<{
    user_name: string
    tier: '1000' | '2000' | '3000'
    is_gift: boolean
  }>
}

function tierLabel(tier: '1000' | '2000' | '3000'): string {
  if (tier === '3000') return 'T3'
  if (tier === '2000') return 'T2'
  return 'T1'
}

function SubscriberBody({ data }: { data: SubscriberBodyData }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <p
          className="text-2xl font-bold"
          style={{
            color: 'var(--accent-green)',
            fontFamily: 'var(--font-heading)',
          }}
        >
          {data.total.toLocaleString()}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {data.points} pts
        </p>
      </div>
      {data.recent.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Recent
          </span>
          {data.recent.map((s, i) => (
            <span
              key={`${s.user_name}-${i}`}
              className="text-xs truncate"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span style={{ color: 'var(--text-primary)' }}>
                {s.user_name}
              </span>{' '}
              <span style={{ color: 'var(--accent-gold)' }}>
                {tierLabel(s.tier)}
              </span>
              {s.is_gift && (
                <span style={{ color: 'var(--text-muted)' }}> · gifted</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function GoalsBody({ goals }: { goals: TwitchGoal[] }) {
  return (
    <div className="flex flex-col gap-3">
      {goals.slice(0, 3).map((goal) => {
        const pct = Math.min(
          100,
          Math.round((goal.current_amount / Math.max(1, goal.target_amount)) * 100),
        )
        return (
          <div key={goal.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span
                className="text-xs truncate"
                style={{ color: 'var(--text-secondary)' }}
                title={goal.description || goal.type}
              >
                {goal.description || goal.type}
              </span>
              <span
                className="text-xs shrink-0 ml-2"
                style={{ color: 'var(--text-muted)' }}
              >
                {goal.current_amount.toLocaleString()} /{' '}
                {goal.target_amount.toLocaleString()}
              </span>
            </div>
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-card-hover)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pct}%`,
                  backgroundColor: 'var(--accent-green)',
                  boxShadow: '0 0 8px var(--accent-green-glow)',
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface VIPsBodyData {
  length: number
  slice: (start: number, end?: number) => Array<{ user_name: string }>
}

function VIPsBody({ vips }: { vips: VIPsBodyData }) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-2xl font-bold"
        style={{
          color: 'var(--accent-green)',
          fontFamily: 'var(--font-heading)',
        }}
      >
        {vips.length}
      </p>
      {vips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {vips.slice(0, 8).map((v, i) => (
            <span
              key={`${v.user_name}-${i}`}
              className="text-[11px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'var(--bg-card-hover)',
                color: 'var(--text-secondary)',
              }}
            >
              {v.user_name}
            </span>
          ))}
          {vips.length > 8 && (
            <span
              className="text-[11px] px-1.5 py-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              +{vips.length - 8} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function HypeTrainsBody({ events }: { events: TwitchHypeTrainEvent[] }) {
  const latest = events[0]?.event_data
  if (!latest) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No recent hype trains
      </p>
    )
  }
  const pct = Math.min(
    100,
    Math.round((latest.total / Math.max(1, latest.goal)) * 100),
  )
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <p
          className="text-2xl font-bold"
          style={{
            color: 'var(--accent-green)',
            fontFamily: 'var(--font-heading)',
          }}
        >
          Lvl {latest.level}
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {latest.total.toLocaleString()} / {latest.goal.toLocaleString()}
        </p>
      </div>
      <div
        className="w-full h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-card-hover)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            backgroundColor: 'var(--accent-twitch)',
            boxShadow: '0 0 8px var(--accent-twitch-glow)',
          }}
        />
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {events.length} in history
      </p>
    </div>
  )
}

function PollsBody({ polls }: { polls: TwitchPoll[] }) {
  const latest = polls[0]
  if (!latest) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No recent polls
      </p>
    )
  }
  const totalVotes = latest.choices.reduce((sum, c) => sum + c.votes, 0)
  const sortedChoices = [...latest.choices].sort((a, b) => b.votes - a.votes)
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-sm font-semibold truncate"
        style={{ color: 'var(--text-primary)' }}
        title={latest.title}
      >
        {latest.title}
      </p>
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {latest.status} · {totalVotes.toLocaleString()} votes
      </span>
      <div className="flex flex-col gap-1.5">
        {sortedChoices.slice(0, 4).map((choice) => {
          const pct =
            totalVotes > 0
              ? Math.round((choice.votes / totalVotes) * 100)
              : 0
          return (
            <div key={choice.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span
                  className="text-xs truncate"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {choice.title}
                </span>
                <span
                  className="text-xs shrink-0 ml-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {pct}%
                </span>
              </div>
              <div
                className="w-full h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card-hover)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: 'var(--accent-green)',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PredictionsBody({ predictions }: { predictions: TwitchPrediction[] }) {
  const latest = predictions[0]
  if (!latest) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No recent predictions
      </p>
    )
  }
  const totalPoints = latest.outcomes.reduce(
    (sum, o) => sum + o.channel_points,
    0,
  )
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-sm font-semibold truncate"
        style={{ color: 'var(--text-primary)' }}
        title={latest.title}
      >
        {latest.title}
      </p>
      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {latest.status} · {totalPoints.toLocaleString()} pts staked
      </span>
      <div className="flex flex-col gap-1.5">
        {latest.outcomes.slice(0, 2).map((outcome) => {
          const pct =
            totalPoints > 0
              ? Math.round((outcome.channel_points / totalPoints) * 100)
              : 0
          const isWinner = outcome.id === latest.winning_outcome_id
          const color =
            outcome.color === 'PINK' ? '#ff6bcb' : 'var(--accent-hls)'
          return (
            <div key={outcome.id} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between">
                <span
                  className="text-xs truncate"
                  style={{
                    color: isWinner
                      ? 'var(--accent-green)'
                      : 'var(--text-secondary)',
                    fontWeight: isWinner ? 700 : 400,
                  }}
                >
                  {outcome.title}
                  {isWinner && ' ✓'}
                </span>
                <span
                  className="text-xs shrink-0 ml-2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {outcome.users.toLocaleString()} picks
                </span>
              </div>
              <div
                className="w-full h-1 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--bg-card-hover)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BitsBody({
  leaders,
}: {
  leaders: Array<{ user_name: string; score: number; rank: number }>
}) {
  return (
    <div className="flex flex-col gap-1">
      {leaders.slice(0, 5).map((leader) => (
        <div
          key={`${leader.user_name}-${leader.rank}`}
          className="flex items-center justify-between text-xs"
        >
          <span
            className="flex items-center gap-2 truncate"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span
              className="text-[10px] font-bold w-4 text-center"
              style={{ color: 'var(--text-muted)' }}
            >
              #{leader.rank}
            </span>
            <span style={{ color: 'var(--text-primary)' }}>
              {leader.user_name}
            </span>
          </span>
          <span
            className="shrink-0 font-semibold"
            style={{ color: 'var(--accent-gold)' }}
          >
            {leader.score.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── The panel itself ────────────────────────────────────────────────

export default function YourStatsPanel() {
  const { state, dispatch } = useApp()
  const { handleAuthError } = useTwitchAuth()

  const isOpen = state.navPanel.open === 'your-stats'
  const authUser = state.auth.user
  const broadcasterId = isOpen ? (authUser?.id ?? null) : null
  const isStreamer =
    authUser !== null &&
    authUser.broadcaster_type !== '' &&
    (authUser.broadcaster_type === 'affiliate' ||
      authUser.broadcaster_type === 'partner')

  const handleAuthErrorCallback = useCallback(
    () => handleAuthError(null),
    [handleAuthError],
  )
  const fetchOptions = useMemo(
    () => ({ handleAuthError: handleAuthErrorCallback }),
    [handleAuthErrorCallback],
  )

  const { stats, loading, sessionError, refetch } = useYourStats(
    broadcasterId,
    isStreamer,
    fetchOptions,
  )

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_NAV_PANEL' })
  }, [dispatch])

  const accountAge = useMemo(() => {
    if (!authUser) return null
    const created = new Date(authUser.created_at)
    const now = new Date()
    const years = now.getFullYear() - created.getFullYear()
    const months = now.getMonth() - created.getMonth()
    const total = years * 12 + months
    if (total >= 12) {
      const y = Math.floor(total / 12)
      const m = total % 12
      return m > 0 ? `${y}y ${m}mo` : `${y}y`
    }
    return `${total}mo`
  }, [authUser])

  return (
    <SlidedownPanel panelId="your-stats" ariaLabel="Your Stats panel">
      <>
        {/* Header row */}
        {/* flex-wrap lets the refresh/close buttons wrap below the
            user profile block on narrow screens instead of cramping
            into the remaining horizontal space. */}
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            {authUser?.profile_image_url && (
              <img
                src={authUser.profile_image_url}
                alt={authUser.display_name}
                className="w-12 h-12 rounded-full shrink-0"
                style={{ border: '2px solid var(--accent-green)' }}
              />
            )}
            <div className="min-w-0">
              <h2
                className="text-xl font-bold font-heading"
                style={{
                  color: 'var(--accent-green)',
                  letterSpacing: '0.08em',
                }}
              >
                Your Stats
              </h2>
              {authUser && (
                <p
                  className="text-sm mt-0.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {authUser.display_name}
                  </span>
                  {' · '}
                  {isStreamer ? (
                    <span
                      style={{ color: 'var(--accent-twitch)', fontWeight: 600 }}
                    >
                      {authUser.broadcaster_type.toUpperCase()}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>viewer</span>
                  )}
                  {accountAge && ` · Joined ${accountAge} ago`}
                </p>
              )}
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={refetch}
              disabled={loading || broadcasterId === null}
              aria-label="Refresh Your Stats"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
              }}
            >
              <RefreshCw
                size={14}
                className={loading ? 'animate-spin' : ''}
              />
              refresh
            </button>
            <button
              type="button"
              onClick={close}
              aria-label="Close Your Stats panel"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors hover:bg-white/10"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
                letterSpacing: '0.05em',
              }}
            >
              <X size={14} />
              close
            </button>
          </div>
        </div>

        {/* Session-wide error banner (e.g. token missing new scopes) */}
        {sessionError && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-md mb-4"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--text-primary)',
            }}
          >
            <AlertCircle
              size={16}
              className="shrink-0 mt-0.5"
              style={{ color: 'var(--accent-red)' }}
            />
            <div className="text-sm">
              <p className="font-semibold">
                Couldn&apos;t load stats — your session may need to reconnect.
              </p>
              <p
                className="text-xs mt-1"
                style={{ color: 'var(--text-muted)' }}
              >
                If you logged in before this feature shipped, log out and
                reconnect Twitch to grant the new permissions.
              </p>
            </div>
          </div>
        )}

        {/* Stats grid */}
        {authUser && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pb-4">
            {/* Followers — shown to everyone */}
            <StatCard
              title="Followers"
              icon={<Users size={14} />}
              section={stats.followerCount}
            >
              {(count) => <FollowerCountBody count={count} />}
            </StatCard>

            {/* Streamer-only sections */}
            {isStreamer && (
              <>
                <StatCard
                  title="Subscribers"
                  icon={<Star size={14} />}
                  section={stats.subscribers}
                  emptyMessage="No active subscribers"
                >
                  {(data) => <SubscriberBody data={data} />}
                </StatCard>

                <StatCard
                  title="VIPs"
                  icon={<Crown size={14} />}
                  section={stats.vips}
                  emptyMessage="No VIPs yet"
                >
                  {(vips) => <VIPsBody vips={vips} />}
                </StatCard>

                <StatCard
                  title="Recent Hype Train"
                  icon={<TrendingUp size={14} />}
                  section={stats.hypeTrains}
                  emptyMessage="No recent hype trains"
                >
                  {(events) => <HypeTrainsBody events={events} />}
                </StatCard>

                <StatCard
                  title="Latest Poll"
                  icon={<BarChart3 size={14} />}
                  section={stats.polls}
                  emptyMessage="No recent polls"
                >
                  {(polls) => <PollsBody polls={polls} />}
                </StatCard>

                <StatCard
                  title="Latest Prediction"
                  icon={<Sparkles size={14} />}
                  section={stats.predictions}
                  emptyMessage="No recent predictions"
                >
                  {(predictions) => (
                    <PredictionsBody predictions={predictions} />
                  )}
                </StatCard>

                <StatCard
                  title="Top Bit Cheerers"
                  icon={<Coins size={14} />}
                  section={stats.bits}
                  emptyMessage="No bits contributions yet"
                  wide
                >
                  {(leaders) => <BitsBody leaders={leaders} />}
                </StatCard>

                <StatCard
                  title="Active Goals"
                  icon={<Target size={14} />}
                  section={stats.goals}
                  emptyMessage="No active goals"
                  wide
                >
                  {(goals) => <GoalsBody goals={goals} />}
                </StatCard>
              </>
            )}

            {/* Non-streamer nudge */}
            {!isStreamer && (
              <div
                className="md:col-span-2 lg:col-span-2 flex flex-col gap-2 p-4 rounded-lg"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px dashed var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Streamer-only sections (subscribers, goals, VIPs, hype
                  trains, polls, predictions, bits) unlock when your
                  account becomes a Twitch Affiliate or Partner.
                </p>
                <p className="text-xs">
                  For now, your follower count is shown above.
                </p>
              </div>
            )}
          </div>
        )}
      </>
    </SlidedownPanel>
  )
}
