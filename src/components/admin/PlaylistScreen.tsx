import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  LISTED_STATES,
  STREAM_STATES,
  addStream,
  getStreams,
  pinStream,
  removeStream,
  setDefaultStream,
  updateStream,
  type AdminStream,
  type AdminStreams,
  type StreamActionResult,
  type StreamState,
} from '../../lib/adminApi'
import { regionName } from '../../lib/countries'
import { useAdminSession } from './AdminSessionContext'
import StreamPreview from './StreamPreview'
import { useAdminResource } from './useAdminResource'

const CARD = { background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }
const INPUT = { background: 'var(--bg-card)', borderColor: 'var(--border-accent)', color: 'var(--text-primary)' }
const SEARCH_DEBOUNCE_MS = 300
const PAGE_SIZE = 50

/** Plain words for the rule that refused an address, a name or a group. Anything new the server says is shown as it is. */
const REASONS: Record<string, string> = {
  credentials: 'That address has a login in it. Addresses with logins are never stored.',
  token: 'That address has a token-like parameter. Addresses that carry a secret are never stored.',
  bad_address: 'That is not a usable http or https address.',
  adult: 'That group looks like adult content, which is never added.',
  bad_name: 'The name must be 1 to 200 characters, with no control characters.',
  id_clash: 'That address collides with another stream’s short id. Try a slightly different address.',
}
const reasonText = (reason: string) => REASONS[reason] ?? `The server refused it (${reason}).`
const NOTHING_CHANGED = 'That did not work. Nothing was changed.'

const host = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}
const groupsOf = (text: string): string[] =>
  text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)

interface Editing {
  publicId: string
  name: string
  groups: string
  error: string | null
}

/**
 * The playlist: every stream in every state, with the owner's actions: add a stream (the import's rules decide), edit
 * its name and groups, pin it, make it the page's default, and remove it. Names and groups come from a public list and
 * are shown as plain text; the address is shown as its host only. A request in flight disables every action, so a
 * double click makes one request, and every write is audited by the server.
 */
export default function PlaylistScreen() {
  const { onExpired } = useAdminSession()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<StreamState | ''>('')
  const [country, setCountry] = useState('')
  const [offset, setOffset] = useState(0)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [behind, setBehind] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [confirming, setConfirming] = useState<AdminStream | null>(null)
  // The stream being played in place, and the list (page and filters) it was opened on.
  const [previewing, setPreviewing] = useState<{ publicId: string; listKey: string } | null>(null)
  const [address, setAddress] = useState('')
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(text)
      setOffset(0)
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [text])
  useEffect(() => () => controller.current?.abort(), [])

  // The server takes a country as exactly two letters (anything else is a 400): while one letter is typed, no filter yet.
  const countryFilter = country.length === 2 ? country : ''
  const streams = useAdminResource((signal) => getStreams({ text: query, state, country: countryFilter }, { limit: PAGE_SIZE, offset }, signal), [query, state, countryFilter, offset])

  // The list stays on screen while it reloads after an action (a table that vanished on every click would be hard to use).
  const [kept, setKept] = useState<AdminStreams | null>(null)
  if (streams.data !== null && streams.data !== kept) setKept(streams.data)
  const data = streams.status === 'error' ? null : (streams.data ?? kept)

  // The preview belongs to the list it was opened on: another page or filter closes it, and so does a reload that no longer
  // lists the stream or lists it as removed (a removed stream has no Play).
  const listKey = JSON.stringify([query, state, countryFilter, offset])
  const previewed = previewing === null ? null : (data?.streams.find((s) => s.publicId === previewing.publicId) ?? null)
  if (previewing !== null && (previewing.listKey !== listKey || (data !== null && (previewed === null || previewed.state === 'removed')))) setPreviewing(null)

  /** Runs one write. Returns the result so the caller can show a message next to what it was about; `signed_out` ends the session. */
  async function run(act: (signal: AbortSignal) => Promise<StreamActionResult>): Promise<StreamActionResult | null> {
    if (pending) return null
    controller.current = new AbortController()
    setPending(true)
    const result = await act(controller.current.signal)
    setPending(false)
    if (result.kind === 'signed_out') {
      onExpired()
      return null
    }
    if (result.kind === 'ok' || result.kind === 'not_found') streams.reload()
    if (result.kind === 'ok') setBehind(!result.data.snapshot)
    return result
  }

  /** The message for the results every action shares; null for `ok`. */
  function failure(result: StreamActionResult, gone: string): string | null {
    switch (result.kind) {
      case 'ok':
        return null
      case 'not_found':
        return gone
      case 'not_listed':
        return 'Visitors cannot see that stream (it is held, unplayable, dead or removed), so it cannot be the default.'
      case 'rejected':
        return reasonText(result.reason)
      case 'already_known':
        return 'That address is already in the list.'
      default:
        return NOTHING_CHANGED
    }
  }

  async function act(call: (signal: AbortSignal) => Promise<StreamActionResult>) {
    const result = await run(call)
    if (result === null) return
    setNotice(failure(result, 'That stream is already gone.'))
  }

  async function submitAdd(event: FormEvent) {
    event.preventDefault()
    const result = await run((signal) => addStream({ url: address.trim(), name: name.trim(), group: group.trim() }, signal))
    if (result === null) return
    if (result.kind === 'ok') {
      // An http:// address or an unusual port is stored but never shown to visitors: say so, not only "added".
      const hidden =
        result.data.state === 'unplayable'
          ? ' Visitors will not see it: addresses that start with http:// cannot play on this page.'
          : result.data.state === 'held'
            ? ' Visitors will not see it: it uses an unusual port (not 80 or 443).'
            : ''
      setNotice(`Added “${name.trim()}”.${hidden}`)
      setAddError(null)
      setAddress('')
      setName('')
      setGroup('')
    } else {
      setNotice(null)
      setAddError(result.kind === 'unavailable' || result.kind === 'refused' || result.kind === 'busy' ? 'That did not work. Nothing was added.' : failure(result, 'That did not work.'))
    }
  }

  async function saveEdit() {
    if (editing === null) return
    const result = await run((signal) => updateStream(editing.publicId, { name: editing.name.trim(), groups: groupsOf(editing.groups) }, signal))
    if (result === null) return
    if (result.kind === 'ok' || result.kind === 'not_found') {
      setNotice(result.kind === 'ok' ? null : 'That stream is already gone.')
      setEditing(null)
    } else {
      setEditing({ ...editing, error: failure(result, '') })
    }
  }

  async function confirmRemove() {
    if (confirming === null) return
    const target = confirming
    const result = await run((signal) => removeStream(target.publicId, signal))
    setConfirming(null)
    // Once it is removed (or already gone) there is nothing to play; a removal that failed leaves the preview as it was.
    if (result !== null && (result.kind === 'ok' || result.kind === 'not_found')) setPreviewing((open) => (open?.publicId === target.publicId ? null : open))
    if (result !== null) setNotice(failure(result, 'That stream is already gone.'))
  }

  const total = data?.total ?? 0
  const from = offset + 1
  const to = offset + (data?.streams.length ?? 0)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-semibold">Playlist</h2>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          aria-label="Search streams"
          placeholder="Search by name"
          value={text}
          maxLength={100}
          onChange={(event) => setText(event.target.value)}
          className="w-full max-w-xs rounded border px-3 py-2 text-sm"
          style={INPUT}
        />
        <select
          aria-label="State"
          value={state}
          onChange={(event) => {
            setState(event.target.value as StreamState | '')
            setOffset(0)
          }}
          className="rounded border px-3 py-2 text-sm"
          style={INPUT}
        >
          <option value="">All states</option>
          {STREAM_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="text"
          aria-label="Country"
          placeholder="Country"
          value={country}
          maxLength={2}
          onChange={(event) => {
            setCountry(event.target.value.replace(/[^A-Za-z]/g, '').toLowerCase().slice(0, 2))
            setOffset(0)
          }}
          className="w-24 rounded border px-3 py-2 text-sm"
          style={INPUT}
        />
      </div>

      <form aria-label="Add a stream" onSubmit={(event) => void submitAdd(event)} className="flex flex-col gap-2 rounded-lg border p-4" style={CARD}>
        <h3 className="m-0 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
          Add a stream
        </h3>
        <div className="flex flex-wrap gap-2">
          <input type="text" aria-label="Stream address" placeholder="https://…/stream.m3u8" value={address} maxLength={2000} onChange={(event) => setAddress(event.target.value)} className="min-w-0 flex-[3] rounded border px-3 py-2 text-sm" style={INPUT} />
          <input type="text" aria-label="Stream name" placeholder="Name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-[2] rounded border px-3 py-2 text-sm" style={INPUT} />
          <input type="text" aria-label="Group" placeholder="Group (News; Sports)" value={group} maxLength={200} onChange={(event) => setGroup(event.target.value)} className="min-w-0 flex-[2] rounded border px-3 py-2 text-sm" style={INPUT} />
          <button type="submit" disabled={pending || address.trim() === '' || name.trim() === ''} className="rounded px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent-green)', color: '#000' }}>
            Add stream
          </button>
        </div>
        {addError !== null && (
          <p role="alert" className="m-0 text-sm" style={{ color: 'var(--accent-red)' }}>
            {addError}
          </p>
        )}
      </form>

      {notice !== null && (
        <p role="status" className="m-0" style={{ color: 'var(--accent-gold)' }}>
          {notice}
        </p>
      )}
      {behind && (
        <p className="m-0 text-sm" style={{ color: 'var(--accent-gold)' }}>
          Saved, but the visitor list could not be refreshed yet. It catches up on the next change.
        </p>
      )}

      {data === null && streams.status === 'loading' && (
        <p role="status" style={{ color: 'var(--text-secondary)' }}>
          Loading…
        </p>
      )}
      {streams.status === 'error' && (
        <div role="alert">
          <p>Could not load the playlist.</p>
          <button type="button" onClick={streams.reload} className="mt-2 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
            Try again
          </button>
        </div>
      )}

      {data !== null && (
        <section className="rounded-lg border p-4" style={CARD} aria-busy={streams.status === 'loading'}>
          <ul aria-label="Streams by state" className="m-0 mb-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs" style={{ color: 'var(--text-secondary)' }}>
            {STREAM_STATES.filter((s) => (data.counts[s] ?? 0) > 0).map((s) => (
              <li key={s}>
                {s} {(data.counts[s] ?? 0).toLocaleString('en-US')}
              </li>
            ))}
          </ul>

          {data.streams.length === 0 ? (
            <p className="m-0">No streams match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table aria-label="Playlist streams" className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                    <th className="py-1 pr-3 font-normal">Name</th>
                    <th className="py-1 pr-3 font-normal">State</th>
                    <th className="py-1 pr-3 font-normal">Country</th>
                    <th className="py-1 pr-3 font-normal">Groups</th>
                    <th className="py-1 pr-3 font-normal">Source</th>
                    <th className="py-1 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {data.streams.map((s) => (
                    <Fragment key={s.publicId}>
                      {editing?.publicId === s.publicId ? (
                        <tr>
                          <td colSpan={6} className="py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <input type="text" aria-label={`Name of ${s.name}`} value={editing.name} maxLength={200} onChange={(event) => setEditing({ ...editing, name: event.target.value })} className="min-w-0 flex-[2] rounded border px-2 py-1 text-sm" style={INPUT} />
                              <input type="text" aria-label={`Groups of ${s.name}`} value={editing.groups} maxLength={200} onChange={(event) => setEditing({ ...editing, groups: event.target.value })} className="min-w-0 flex-[2] rounded border px-2 py-1 text-sm" style={INPUT} />
                              <button type="button" aria-label={`Save ${s.name}`} disabled={pending || editing.name.trim() === ''} onClick={() => void saveEdit()} className="rounded px-3 py-1 text-xs font-semibold disabled:opacity-50" style={{ background: 'var(--accent-green)', color: '#000' }}>
                                Save
                              </button>
                              <button type="button" aria-label={`Cancel editing ${s.name}`} disabled={pending} onClick={() => setEditing(null)} className="rounded border px-3 py-1 text-xs" style={{ borderColor: 'var(--border-accent)' }}>
                                Cancel
                              </button>
                            </div>
                            {editing.error !== null && (
                              <p role="alert" className="m-0 mt-1 text-xs" style={{ color: 'var(--accent-red)' }}>
                                {editing.error}
                              </p>
                            )}
                          </td>
                        </tr>
                      ) : (
                        <tr>
                          <td className="py-1 pr-3">
                            <div>{s.name}</div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {host(s.url)}
                            </div>
                          </td>
                          <td className="py-1 pr-3">{s.stateReason ? `${s.state} (${s.stateReason})` : s.state}</td>
                          <td className="py-1 pr-3">{s.country ? regionName(s.country) : '–'}</td>
                          <td className="py-1 pr-3">{s.groups.join(', ')}</td>
                          <td className="py-1 pr-3">{s.source}</td>
                          <td className="py-1 text-right whitespace-nowrap">
                            {s.state !== 'removed' && (
                              <span className="inline-flex flex-wrap justify-end gap-1">
                                <button type="button" aria-label={`Play ${s.name}`} aria-expanded={previewed?.publicId === s.publicId} onClick={() => setPreviewing(previewed?.publicId === s.publicId ? null : { publicId: s.publicId, listKey })} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-accent)' }}>
                                  Play
                                </button>
                                <button type="button" aria-label={s.pinned ? `Unpin ${s.name}` : `Pin ${s.name}`} aria-pressed={s.pinned} disabled={pending} onClick={() => void act((signal) => pinStream(s.publicId, !s.pinned, signal))} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-accent)', color: s.pinned ? 'var(--accent-gold)' : undefined }}>
                                  {s.pinned ? 'Pinned' : 'Pin'}
                                </button>
                                {s.isDefault ? (
                                  <span className="px-2 py-1 text-xs" style={{ color: 'var(--accent-green)' }}>
                                    Default
                                  </span>
                                ) : (
                                  <button type="button" aria-label={`Make ${s.name} the default`} disabled={pending || !LISTED_STATES.includes(s.state)} onClick={() => void act((signal) => setDefaultStream(s.publicId, signal))} className="rounded border px-2 py-1 text-xs disabled:opacity-40" style={{ borderColor: 'var(--border-accent)' }}>
                                    Make default
                                  </button>
                                )}
                                <button type="button" aria-label={`Edit ${s.name}`} disabled={pending} onClick={() => { setPreviewing((open) => (open?.publicId === s.publicId ? null : open)); setEditing({ publicId: s.publicId, name: s.name, groups: s.groups.join('; '), error: null }) }} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-accent)' }}>
                                  Edit
                                </button>
                                <button type="button" aria-label={`Remove ${s.name}`} disabled={pending} onClick={() => setConfirming(s)} className="rounded border px-2 py-1 text-xs" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>
                                  Remove
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      )}
                      {previewed?.publicId === s.publicId && (
                        <tr>
                          <td colSpan={6} className="pb-2">
                            <StreamPreview stream={s} onClose={() => setPreviewing(null)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-3 flex items-center justify-between gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <span>{total === 0 ? 'No streams' : `Showing ${from}–${to} of ${total.toLocaleString('en-US')} streams`}</span>
            <span className="flex gap-2">
              <button type="button" aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} className="rounded border px-3 py-1 disabled:opacity-40" style={{ borderColor: 'var(--border-accent)' }}>
                Previous
              </button>
              <button type="button" aria-label="Next page" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)} className="rounded border px-3 py-1 disabled:opacity-40" style={{ borderColor: 'var(--border-accent)' }}>
                Next
              </button>
            </span>
          </div>
        </section>
      )}

      {confirming !== null && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-remove-stream-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md rounded-lg border p-5" style={CARD}>
            <h3 id="confirm-remove-stream-title" className="m-0 text-base font-semibold">
              Remove {confirming.name}?
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              The stream leaves the list. Its row stays as a tombstone so a re-import cannot bring it back, and this cannot be undone here.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirming(null)} disabled={pending} className="rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
                Cancel
              </button>
              <button type="button" disabled={pending} onClick={() => void confirmRemove()} className="rounded px-3 py-1 text-sm font-semibold" style={{ background: 'var(--accent-red)', color: '#fff' }}>
                Remove stream
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
