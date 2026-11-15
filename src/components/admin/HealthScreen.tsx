import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { applyChecker, getChecker, setCheckerPaused, type AdminChecker, type CheckerApplyRefusal } from '../../lib/adminApi'
import { formatCount, formatMb, formatUtc } from '../../lib/adminFormat'
import { useAdminSession } from './AdminSessionContext'
import { useAdminResource } from './useAdminResource'

const CARD = { background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }
const HEADING = { color: 'var(--text-secondary)' }
const MUTED = { color: 'var(--text-muted)' }

const REFUSAL_TEXT: Record<CheckerApplyRefusal, string> = {
  incomplete: 'Nothing was changed: the first pass is not finished, some streams have no result yet.',
  stale: 'Nothing was changed: the results are older than 3 days. Run the first pass again.',
  too_many_failures: "Nothing was changed: Two thirds or more of the checks failed, so the server's own network is the likely cause. Run the first pass again.",
}

const streams = (n: number) => `${formatCount(n)} ${n === 1 ? 'stream' : 'streams'}`

/**
 * The stream checker at a glance: where its first pass stands (a shadow run, which changes nothing visitors see, until the
 * owner presses Apply), what Apply would hide, the hosts where most streams failed, what the checker is withholding from
 * removal, and the download budget. Every host and stream name comes from the server and is shown as text, never markup.
 */
export default function HealthScreen() {
  const { onExpired } = useAdminSession()
  const checker = useAdminResource((signal) => getChecker(signal), [])
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const aborter = useRef<AbortController | null>(null)
  useEffect(() => () => aborter.current?.abort(), [])

  if (checker.status === 'loading') {
    return (
      <p role="status" style={{ color: 'var(--text-secondary)' }}>
        Loading…
      </p>
    )
  }
  if (checker.data === null) {
    return (
      <div role="alert">
        <p>Could not load the checker's status.</p>
        <button type="button" onClick={checker.reload} className="mt-2 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
          Try again
        </button>
      </div>
    )
  }
  const data: AdminChecker = checker.data
  const shadow = data.mode === 'shadow'

  function signal(): AbortSignal {
    aborter.current?.abort()
    aborter.current = new AbortController()
    return aborter.current.signal
  }

  async function apply() {
    setPending(true)
    setProblem(null)
    setNotice(null)
    const result = await applyChecker(signal())
    setPending(false)
    setConfirming(false)
    if (result.kind === 'signed_out') return onExpired()
    if (result.kind === 'ok') {
      const done = result.data
      setNotice(
        done.already
          ? 'Already applied: nothing changed.'
          : `Applied: ${formatCount(done.hidden)} hidden, ${formatCount(done.listed)} listed.${done.snapshot ? '' : ' The visitor list could not be refreshed yet; it catches up on the next change.'}`,
      )
      checker.reload()
    } else if (result.kind === 'refused_apply') {
      setProblem(REFUSAL_TEXT[result.reason])
    } else {
      setProblem('Could not apply the first pass: the server did not answer.')
    }
  }

  async function pause(paused: boolean) {
    setPending(true)
    setProblem(null)
    setNotice(null)
    const result = await setCheckerPaused(paused, signal())
    setPending(false)
    if (result.kind === 'signed_out') return onExpired()
    if (result.kind === 'ok') checker.reload()
    else setProblem('Could not change the pause switch: the server did not answer.')
  }

  const percent = data.progress.eligible === 0 ? 0 : Math.min(100, Math.round((data.progress.checked / data.progress.eligible) * 100))
  const outcome = Object.entries(data.outcome).sort(([, a], [, b]) => b - a)
  const states = Object.entries(data.counts)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-lg font-semibold">Health</h2>
        <div className="flex items-center gap-3">
          {data.paused && (
            <span className="rounded px-2 py-1 text-xs font-semibold" style={{ background: 'var(--accent-orange)', color: '#000' }}>
              Paused
            </span>
          )}
          <button type="button" disabled={pending} onClick={() => void pause(!data.paused)} className="rounded border px-3 py-1 text-sm disabled:opacity-50" style={{ borderColor: 'var(--border-accent)' }}>
            {data.paused ? 'Resume the checker' : 'Pause the checker'}
          </button>
        </div>
      </div>

      {notice !== null && (
        <p role="status" className="m-0 rounded border p-3 text-sm" style={{ ...CARD, color: 'var(--accent-green)' }}>
          {notice}
        </p>
      )}
      {problem !== null && (
        <p role="alert" className="m-0 rounded border p-3 text-sm" style={{ ...CARD, color: 'var(--accent-red)' }}>
          {problem}
        </p>
      )}

      <section className="rounded-lg border p-4" style={CARD}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={HEADING}>
          First pass
        </h3>
        {shadow ? (
          <>
            <p className="m-0 mb-2 text-sm">
              <strong>Shadow run.</strong>
            </p>
            <p className="m-0 mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              The checker is recording what it finds. Nothing visitors see has changed yet.
            </p>
            <p className="m-0 mb-1 text-sm">{`${formatCount(data.progress.checked)} of ${formatCount(data.progress.eligible)} checked`}</p>
            <div
              role="progressbar"
              aria-label="First pass progress"
              aria-valuemin={0}
              aria-valuemax={data.progress.eligible}
              aria-valuenow={data.progress.checked}
              className="mb-2 h-2 w-full overflow-hidden rounded"
              style={{ background: 'var(--bg-card-hover)' }}
            >
              <div className="h-full" style={{ width: `${percent}%`, background: 'var(--accent-green)' }} />
            </div>
            {data.progress.oldestResultAt !== null && (
              <p className="m-0 mb-3 text-xs" style={MUTED}>
                Oldest result: {formatUtc(data.progress.oldestResultAt)}
              </p>
            )}
            <p className="m-0 mb-2 text-sm">Apply would hide {streams(data.wouldHide)} that visitors can see now.</p>

            {outcome.length > 0 && (
              <div className="mb-3 overflow-x-auto">
                <table aria-label="First pass results" className="text-sm">
                  <thead>
                    <tr className="text-left" style={MUTED}>
                      <th className="py-1 pr-6 font-normal">Result</th>
                      <th className="py-1 font-normal">Streams</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.map(([code, n]) => (
                      <tr key={code}>
                        <td className="py-1 pr-6">{code}</td>
                        <td className="py-1">{formatCount(n)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {confirming ? (
              <div role="alertdialog" aria-label="Apply the first pass" className="rounded border p-3" style={{ borderColor: 'var(--accent-orange)' }}>
                <p className="m-0 mb-3 text-sm">
                  Apply will hide {streams(data.wouldHide)} and list the rest. Each hidden stream is checked again every day and comes back when it passes.
                </p>
                <div className="flex gap-2">
                  <button type="button" disabled={pending} onClick={() => void apply()} className="rounded px-3 py-1 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent-green)', color: '#000' }}>
                    Confirm apply
                  </button>
                  <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="rounded border px-3 py-1 text-sm disabled:opacity-50" style={{ borderColor: 'var(--border-accent)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" disabled={pending} onClick={() => setConfirming(true)} className="rounded px-3 py-1 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent-green)', color: '#000' }}>
                Apply the first pass
              </button>
            )}
          </>
        ) : (
          <p className="m-0 text-sm">Live since {data.appliedAt === null ? 'an unknown time' : formatUtc(data.appliedAt)}.</p>
        )}
      </section>

      {data.clusters.length > 0 && (
        <section className="rounded-lg border p-4" style={CARD}>
          <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={HEADING}>
            Hosts where most streams failed
          </h3>
          <p className="m-0 mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
            These hosts may be down, or blocking this server (the checker runs from one datacenter, so a stream blocked for its region looks dead). Look twice before you apply.
          </p>
          <div className="overflow-x-auto">
            <table aria-label="Hosts where most streams failed" className="text-sm">
              <thead>
                <tr className="text-left" style={MUTED}>
                  <th className="py-1 pr-6 font-normal">Host</th>
                  <th className="py-1 font-normal">Failed</th>
                </tr>
              </thead>
              <tbody>
                {data.clusters.map((c) => (
                  <tr key={c.host}>
                    <td className="py-1 pr-6">{c.host}</td>
                    <td className="py-1">{`${formatCount(c.failed)} of ${formatCount(c.streams)}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(data.flagged.length > 0 || data.guardedHosts.length > 0) && (
        <section className="rounded-lg border p-4" style={CARD}>
          <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={HEADING}>
            Needs a look
          </h3>
          {data.flagged.length > 0 && (
            <ul aria-label="Streams the checker never removes" className="m-0 mb-3 list-disc pl-5 text-sm">
              {data.flagged.map((f) => (
                <li key={f.publicId}>{`${f.name}: ${[f.pinned ? 'pinned' : null, f.isDefault ? 'the default' : null].filter(Boolean).join(' and ')} and ${f.state}. The checker never removes it, and your pin or default setting is kept.`}</li>
              ))}
            </ul>
          )}
          {data.guardedHosts.length > 0 && (
            <>
              <p className="m-0 mb-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Hosts whose failures were set aside, because most of their streams failed at once:
              </p>
              <ul aria-label="Guarded hosts" className="m-0 list-disc pl-5 text-sm">
                {data.guardedHosts.map((g) => (
                  <li key={g.host}>{`${g.host}: ${streams(g.streams)}`}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="rounded-lg border p-4" style={CARD}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={HEADING}>
          Streams per state
        </h3>
        {states.length === 0 ? (
          <p className="m-0 text-sm">No streams yet.</p>
        ) : (
          <ul aria-label="Streams per state" className="m-0 mb-3 flex list-none flex-wrap gap-x-6 gap-y-1 p-0 text-sm">
            {states.map(([state, n]) => (
              <li key={state}>{`${state}: ${formatCount(n)}`}</li>
            ))}
          </ul>
        )}
        <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>
          The lists of dead, removed and unplayable streams are on the <Link to="/admin/playlist">Playlist screen</Link> (use its State filter).
        </p>
      </section>

      <section className="rounded-lg border p-4" style={CARD}>
        <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={HEADING}>
          Download budget
        </h3>
        <p className="m-0 text-sm">{`${formatMb(data.budget.bytesToday)} of ${formatMb(data.budget.dailyCap, 0)} today.`}</p>
        {shadow && <p className="m-0 mt-1 text-sm">{`First pass: ${formatMb(data.budget.firstPassBytes)} of ${formatMb(data.budget.firstPassCap, 0)}.`}</p>}
        {data.lastStop !== null && (
          <p className="m-0 mt-2 text-sm" style={{ color: 'var(--accent-gold)' }}>
            The last run stopped early: {data.lastStop.reason} ({formatUtc(data.lastStop.at)}).
          </p>
        )}
      </section>
    </div>
  )
}
