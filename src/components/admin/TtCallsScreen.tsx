import { useState } from 'react'
import { getTt, type AdminTt } from '../../lib/adminApi'
import { formatCount, formatUtc } from '../../lib/adminFormat'
import BudgetBars from './BudgetBars'
import { useAdminSession } from './AdminSessionContext'
import { useAdminResource } from './useAdminResource'
import WindowSwitch, { type AdminWindow } from './WindowSwitch'

/** TwitchTracker calls per day against the day budget, whether calls are paused, and how the last scheduled run went. */
export default function TtCallsScreen() {
  const { limits } = useAdminSession()
  const [days, setDays] = useState<AdminWindow>(30)
  const tt = useAdminResource((signal) => getTt(days, signal), [days])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold">TT calls</h2>
        <WindowSwitch value={days} onChange={setDays} />
      </div>

      {tt.status === 'loading' && (
        <p role="status" style={{ color: 'var(--text-secondary)' }}>
          Loading…
        </p>
      )}
      {tt.status === 'error' && (
        <div role="alert">
          <p>Could not load the TwitchTracker numbers.</p>
          <button type="button" onClick={tt.reload} className="mt-2 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
            Try again
          </button>
        </div>
      )}
      {tt.data !== null && <TtBody tt={tt.data} budget={limits.ttDayBudget} window={days} />}
    </div>
  )
}

function TtBody({ tt, budget, window }: { tt: AdminTt; budget: number; window: AdminWindow }) {
  const run = tt.lastRun
  return (
    <>
      <section className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Calls per day (UTC)
        </h3>
        <BudgetBars days={tt.days} budget={budget} ariaLabel={`TwitchTracker calls per day over the last ${window} days, against the daily budget`} />
        <p className="m-0 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Budget: {formatCount(budget)} calls a day (the dashed line)
        </p>
      </section>

      <section className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Pause
        </h3>
        <p className="m-0">{tt.pausedUntil !== null ? `Calls resume at ${formatUtc(tt.pausedUntil)}` : 'Not paused'}</p>
      </section>

      <section className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Last scheduled run
        </h3>
        {run === null ? (
          <p className="m-0">No run recorded yet.</p>
        ) : (
          <>
            <p className="m-0">{formatUtc(run.atMs)}</p>
            <p className="m-0 mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              TwitchTracker: {run.ttOk} answered, {run.ttUntracked} untracked, {run.ttError} error, {run.ttSkipped} skipped. Profiles read: {run.profiles}.
            </p>
            <p className="m-0 mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Stopped by: {run.stoppedBy}
            </p>
          </>
        )}
      </section>
    </>
  )
}
