import { useEffect, useRef, useState } from 'react'
import { getHosts, trustHost, untrustHost } from '../../lib/adminApi'
import { formatCount, formatUtc } from '../../lib/adminFormat'
import { useAdminSession } from './AdminSessionContext'
import { useAdminResource } from './useAdminResource'

const CARD = { background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }
const HEADING = { color: 'var(--text-secondary)' }
const MUTED = { color: 'var(--text-muted)' }
const BUTTON = { borderColor: 'var(--border-accent)' }

const streams = (n: number) => `${formatCount(n)} ${n === 1 ? 'stream' : 'streams'}`

/**
 * Restore by host. The checker runs from one datacenter, so a host that blocks it fails every check while it plays fine for
 * visitors. After the owner has played one of a host's streams, "Restore" brings the host's hidden streams back and keeps a
 * failing check from hiding them again (the failure is still recorded). "Stop trusting" hands them back to the checker.
 * Host names come from the server and are shown as text, never markup.
 */
export default function HostsSection() {
  const { onExpired } = useAdminSession()
  const hosts = useAdminResource((signal) => getHosts(signal), [])
  const [typed, setTyped] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const aborter = useRef<AbortController | null>(null)
  useEffect(() => () => aborter.current?.abort(), [])

  if (hosts.data === null) {
    // Quiet while loading; a failure to load is the one thing worth saying, with a way to try again.
    return hosts.status === 'error' ? (
      <section className="rounded-lg border p-4" style={CARD}>
        <p role="alert" className="m-0 mb-2 text-sm">
          Could not load the host list.
        </p>
        <button type="button" onClick={hosts.reload} className="rounded border px-3 py-1 text-sm" style={BUTTON}>
          Try again
        </button>
      </section>
    ) : null
  }
  const data = hosts.data

  function signal(): AbortSignal {
    aborter.current?.abort()
    aborter.current = new AbortController()
    return aborter.current.signal
  }

  async function restore(host: string) {
    setPending(true)
    setNotice(null)
    setProblem(null)
    const result = await trustHost(host, signal())
    setPending(false)
    setConfirming(null)
    if (result.kind === 'signed_out') return onExpired()
    if (result.kind === 'ok') {
      setNotice(`Restored ${streams(result.data.restored)} from ${host}.${result.data.snapshot ? '' : ' The visitor list could not be refreshed yet; it catches up on the next change.'}`)
      setTyped('')
      hosts.reload()
    } else if (result.kind === 'not_found') {
      setProblem(`No stream is stored under ${host}.`)
    } else if (result.kind === 'rejected') {
      setProblem('That is not a host name. Use only the part between https:// and the first slash, without a port.')
    } else {
      setProblem('Could not restore: the server did not answer.')
    }
  }

  async function stop(host: string) {
    setPending(true)
    setNotice(null)
    setProblem(null)
    const result = await untrustHost(host, signal())
    setPending(false)
    if (result.kind === 'signed_out') return onExpired()
    if (result.kind === 'ok') {
      setNotice(`${host} is judged by the checker again.`)
      hosts.reload()
    } else if (result.kind === 'not_found') {
      hosts.reload()
    } else {
      setProblem('Could not stop trusting the host: the server did not answer.')
    }
  }

  const host = typed.trim().toLowerCase()

  return (
    <section className="rounded-lg border p-4" style={CARD} aria-label="Restore by host">
      <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={HEADING}>
        Restore by host
      </h3>
      <p className="m-0 mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
        The checker runs from one datacenter, so a host that blocks it looks dead here but plays for visitors. Play one of its streams first; then restore the host: its hidden streams come back, and a failed check no longer hides
        them (the failure is still recorded). Streams you removed yourself are never restored.
      </p>

      {notice !== null && (
        <p role="status" className="m-0 mb-3 text-sm" style={{ color: 'var(--accent-green)' }}>
          {notice}
        </p>
      )}
      {problem !== null && (
        <p role="alert" className="m-0 mb-3 text-sm" style={{ color: 'var(--accent-red)' }}>
          {problem}
        </p>
      )}

      {data.restorable.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table aria-label="Hosts with hidden streams" className="text-sm">
            <thead>
              <tr className="text-left" style={MUTED}>
                <th className="py-1 pr-6 font-normal">Host</th>
                <th className="py-1 pr-6 font-normal">Hidden</th>
                <th className="py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {data.restorable.map((h) => (
                <tr key={h.host}>
                  <td className="py-1 pr-6">{h.host}</td>
                  <td className="py-1 pr-6">{formatCount(h.streams)}</td>
                  <td className="py-1">
                    {confirming === h.host ? (
                      <span role="alertdialog" aria-label={`Restore ${h.host}`} className="flex items-center gap-2">
                        <button type="button" disabled={pending} onClick={() => void restore(h.host)} className="rounded px-3 py-1 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent-green)', color: '#000' }}>
                          {`Confirm: restore ${streams(h.streams)}`}
                        </button>
                        <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="rounded border px-3 py-1 text-sm disabled:opacity-50" style={BUTTON}>
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button type="button" disabled={pending} onClick={() => setConfirming(h.host)} className="rounded border px-3 py-1 text-sm disabled:opacity-50" style={BUTTON} aria-label={`Restore ${h.host}`}>
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        className="mb-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (host !== '') void restore(host)
        }}
      >
        <label className="text-sm" htmlFor="restore-host">
          Another host
        </label>
        <input
          id="restore-host"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          maxLength={253}
          placeholder="content.uplynk.com"
          autoComplete="off"
          spellCheck={false}
          className="rounded border bg-transparent px-2 py-1 text-sm"
          style={BUTTON}
        />
        <button type="submit" disabled={pending || host === ''} className="rounded border px-3 py-1 text-sm disabled:opacity-50" style={BUTTON}>
          Restore host
        </button>
      </form>

      {data.trusted.length > 0 && (
        <div className="overflow-x-auto">
          <table aria-label="Trusted hosts" className="text-sm">
            <thead>
              <tr className="text-left" style={MUTED}>
                <th className="py-1 pr-6 font-normal">Trusted host</th>
                <th className="py-1 pr-6 font-normal">Shown</th>
                <th className="py-1 pr-6 font-normal">Since</th>
                <th className="py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {data.trusted.map((t) => (
                <tr key={t.host}>
                  <td className="py-1 pr-6">{t.host}</td>
                  <td className="py-1 pr-6">{`${formatCount(t.listed)} of ${formatCount(t.streams)}`}</td>
                  <td className="py-1 pr-6">{formatUtc(t.addedAt)}</td>
                  <td className="py-1">
                    <button type="button" disabled={pending} onClick={() => void stop(t.host)} className="rounded border px-3 py-1 text-sm disabled:opacity-50" style={BUTTON} aria-label={`Stop trusting ${t.host}`}>
                      Stop trusting
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
