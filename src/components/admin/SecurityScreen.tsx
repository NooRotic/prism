import { getSecurity } from '../../lib/adminApi'
import { formatCount, formatUtc } from '../../lib/adminFormat'
import { useAdminResource } from './useAdminResource'

const CARD = { background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }

/**
 * Who tried the admin sign-in and was refused (named, because the owner asked for that and nobody gets in without
 * clicking through Twitch's authorise screen), how many requests came without a valid sign-in, and the owner's own
 * recent changes. Every name and text here comes from the server and is shown as plain text, never as markup.
 */
export default function SecurityScreen() {
  const security = useAdminResource((signal) => getSecurity(signal), [])

  if (security.status === 'loading') {
    return (
      <p role="status" style={{ color: 'var(--text-secondary)' }}>
        Loading…
      </p>
    )
  }
  if (security.data === null) {
    return (
      <div role="alert">
        <p>Could not load the security numbers.</p>
        <button type="button" onClick={security.reload} className="mt-2 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
          Try again
        </button>
      </div>
    )
  }

  const { attempts, audit, signedOutToday } = security.data
  return (
    <div className="flex flex-col gap-6">
      <h2 className="m-0 text-lg font-semibold">Security</h2>

      <section className="rounded-lg border p-4" style={CARD}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Refused attempts
        </h3>
        <p className="m-0 mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {formatCount(signedOutToday)} requests without a valid sign-in today (counted, not named).
        </p>
        {attempts.length === 0 ? (
          <p className="m-0">No refused attempts.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Refused attempts" className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1 pr-3 font-normal">Who</th>
                  <th className="py-1 pr-3 font-normal">First attempt</th>
                  <th className="py-1 pr-3 font-normal">Last attempt</th>
                  <th className="py-1 font-normal">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((attempt) => (
                  <tr key={attempt.twitchId}>
                    <td className="py-1 pr-3">
                      token of {attempt.login !== '' ? attempt.login : '(name not recorded)'}
                      {attempt.viaScript && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--accent-gold)' }}>
                          not via the admin sign-in
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-3">{formatUtc(attempt.firstAttemptAt)}</td>
                    <td className="py-1 pr-3">{formatUtc(attempt.lastAttemptAt)}</td>
                    <td className="py-1">{attempt.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4" style={CARD}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Recent changes
        </h3>
        {audit.length === 0 ? (
          <p className="m-0">No admin changes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label="Recent changes" className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                  <th className="py-1 pr-3 font-normal">When</th>
                  <th className="py-1 pr-3 font-normal">Change</th>
                  <th className="py-1 pr-3 font-normal">Target</th>
                  <th className="py-1 font-normal">Detail</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row, i) => (
                  <tr key={`${row.at}-${i}`}>
                    <td className="py-1 pr-3">{formatUtc(row.at)}</td>
                    <td className="py-1 pr-3">{row.action}</td>
                    <td className="py-1 pr-3">{row.target}</td>
                    <td className="py-1">{row.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
