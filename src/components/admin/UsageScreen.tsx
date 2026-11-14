import { useState } from 'react'
import { getUsage, type AdminUsage } from '../../lib/adminApi'
import { formatCount, toBuckets, weeklyTotals } from '../../lib/adminFormat'
import { USAGE_SECTIONS, type UsageSection } from '../../lib/usageSections'
import BarChart from '../dashboard/BarChart'
import { useAdminResource } from './useAdminResource'
import WindowSwitch, { type AdminWindow } from './WindowSwitch'

const SECTION_LABEL: Record<UsageSection, string> = {
  home: 'Home',
  twitch: 'Twitch',
  youtube: 'YouTube',
  'hls-dash': 'HLS and DASH',
  'chat-popout': 'Chat pop-out',
  other: 'Other',
}

/** Pages opened per day and per week, split by part of PRISM. Counts of page opens, never of people or places. */
export default function UsageScreen() {
  const [days, setDays] = useState<AdminWindow>(14)
  const usage = useAdminResource((signal) => getUsage(days, signal), [days])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-semibold">Usage</h2>
        <WindowSwitch value={days} onChange={setDays} />
      </div>

      {usage.status === 'loading' && (
        <p role="status" style={{ color: 'var(--text-secondary)' }}>
          Loading…
        </p>
      )}
      {usage.status === 'error' && (
        <div role="alert">
          <p>Could not load the usage numbers.</p>
          <button type="button" onClick={usage.reload} className="mt-2 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
            Try again
          </button>
        </div>
      )}
      {usage.data !== null && <UsageBody days={usage.data.days} window={days} />}
    </div>
  )
}

function UsageBody({ days, window }: { days: AdminUsage['days']; window: AdminWindow }) {
  const totals = USAGE_SECTIONS.map((section) => ({
    section,
    total: days.reduce((sum, day) => sum + day.counts[section], 0),
  }))
  const perDay = days.map((day) => ({ date: day.date, value: USAGE_SECTIONS.reduce((sum, section) => sum + day.counts[section], 0) }))

  return (
    <>
      <section className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Pages opened per day (UTC)
        </h3>
        <BarChart buckets={toBuckets(perDay)} ariaLabel={`Pages opened per day over the last ${window} days (UTC)`} />
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <table aria-label="Pages by section" className="w-full text-sm">
          <caption className="pb-1 text-left text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            By section, last {window} days
          </caption>
          <tbody>
            {totals.map(({ section, total }) => (
              <tr key={section}>
                <th scope="row" className="py-1 text-left font-normal">
                  {SECTION_LABEL[section]}
                </th>
                <td className="py-1 text-right" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatCount(total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table aria-label="Pages by week" className="w-full text-sm">
          <caption className="pb-1 text-left text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
            By week (starting Monday, UTC)
          </caption>
          <tbody>
            {weeklyTotals(days).map(({ weekStart, total }) => (
              <tr key={weekStart}>
                <th scope="row" className="py-1 text-left font-normal">
                  {weekStart}
                </th>
                <td className="py-1 text-right" style={{ fontFamily: 'var(--font-mono)' }}>
                  {formatCount(total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
