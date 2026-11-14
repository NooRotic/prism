import { getOverview, type AttentionCode } from '../../lib/adminApi'
import { changeVsYesterday, formatCount, toBuckets } from '../../lib/adminFormat'
import BarChart from '../dashboard/BarChart'
import { useAdminSession } from './AdminSessionContext'
import StatTile from './StatTile'
import { useAdminResource } from './useAdminResource'

const ATTENTION_TEXT: Record<AttentionCode, string> = {
  tt_paused: 'TwitchTracker calls are paused.',
  job_stale: 'The scheduled refresh has not run in over 8 hours.',
  tt_budget_80: "Today's TwitchTracker calls are above 80% of the budget.",
  named_refused_7d: 'Someone tried the admin sign-in and was refused in the last 7 days.',
}

/** The home screen: four numbers, the last 14 days of page opens, and anything that needs a look. */
export default function OverviewScreen() {
  const { limits } = useAdminSession()
  const overview = useAdminResource((signal) => getOverview(signal), [])

  if (overview.status === 'loading') {
    return (
      <p role="status" style={{ color: 'var(--text-secondary)' }}>
        Loading…
      </p>
    )
  }
  if (overview.data === null) {
    return (
      <div role="alert">
        <p>Could not load the overview.</p>
        <button type="button" onClick={overview.reload} className="mt-2 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
          Try again
        </button>
      </div>
    )
  }

  const o = overview.data
  return (
    <div className="flex flex-col gap-6">
      <h2 className="m-0 text-lg font-semibold">Overview</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Pages opened today" value={formatCount(o.pages.today)} note={changeVsYesterday(o.pages.today, o.pages.yesterday)} />
        <StatTile label="New channels (last 24 hours)" value={`${formatCount(o.newChannels.last24h)} of ${formatCount(limits.newPerDay)}`} />
        <StatTile
          label="TwitchTracker calls today"
          value={`${formatCount(o.tt.today)} of ${formatCount(limits.ttDayBudget)}`}
          note={o.tt.paused ? 'Paused (see TT calls)' : undefined}
        />
        <StatTile
          label="Refused attempts"
          value={`${formatCount(o.refused.named7d)} named`}
          note={`in the last 7 days; ${formatCount(o.refused.signedOutToday)} signed out today`}
        />
      </div>

      <section aria-label="Pages opened per day" className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Pages opened per day (UTC)
        </h3>
        <BarChart
          buckets={toBuckets(o.chart.map((d) => ({ date: d.date, value: d.pages })))}
          ariaLabel={`Pages opened per day over the last ${o.chart.length} days (UTC)`}
        />
      </section>

      <section className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Needs a look
        </h3>
        {o.needsAttention.length === 0 ? (
          <p className="m-0">Nothing needs a look.</p>
        ) : (
          <ul className="m-0 list-disc pl-5">
            {o.needsAttention.map((code) => (
              <li key={code}>{ATTENTION_TEXT[code]}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
