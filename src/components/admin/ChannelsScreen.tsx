import { useEffect, useRef, useState } from 'react'
import { getChannels, removeChannel, unblockChannel, type AdminActionResult, type AdminChannel } from '../../lib/adminApi'
import { formatUtc } from '../../lib/adminFormat'
import { useAdminSession } from './AdminSessionContext'
import { useAdminResource } from './useAdminResource'

const CARD = { background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }
const SEARCH_DEBOUNCE_MS = 300

/**
 * The channels the history server tracks, with the owner's two actions: Remove and block (delete a channel's
 * history and stop it being tracked again, replacing the SSH script) and Unblock. Names come from Twitch and are
 * shown as plain text. A request in flight disables the buttons, so a double click makes one request.
 */
export default function ChannelsScreen() {
  const { onExpired } = useAdminSession()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState<AdminChannel | null>(null)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setQuery(text), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [text])
  useEffect(() => () => controller.current?.abort(), [])

  const channels = useAdminResource((signal) => getChannels(query, signal), [query])

  async function run(act: (signal: AbortSignal) => Promise<AdminActionResult>) {
    if (pending) return
    controller.current = new AbortController()
    setPending(true)
    const result = await act(controller.current.signal)
    setPending(false)
    setConfirming(null)
    switch (result.kind) {
      case 'ok':
        setNotice(null)
        channels.reload()
        break
      case 'not_found':
        setNotice('That channel is already gone.')
        channels.reload()
        break
      case 'signed_out':
        onExpired()
        break
      default:
        setNotice('That did not work. Nothing was changed.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 text-lg font-semibold">Channels</h2>
      <input
        type="search"
        aria-label="Search channels"
        placeholder="Search by login or name"
        value={text}
        maxLength={25}
        onChange={(event) => setText(event.target.value.replace(/[^A-Za-z0-9_]/g, ''))}
        className="w-full max-w-sm rounded border px-3 py-2 text-sm"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)', color: 'var(--text-primary)' }}
      />
      {notice !== null && (
        <p role="status" className="m-0" style={{ color: 'var(--accent-gold)' }}>
          {notice}
        </p>
      )}

      {channels.status === 'loading' && (
        <p role="status" style={{ color: 'var(--text-secondary)' }}>
          Loading…
        </p>
      )}
      {channels.status === 'error' && (
        <div role="alert">
          <p>Could not load the channels.</p>
          <button type="button" onClick={channels.reload} className="mt-2 rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
            Try again
          </button>
        </div>
      )}
      {channels.data !== null && (
        <>
          <section className="rounded-lg border p-4" style={CARD}>
            {channels.data.channels.length === 0 ? (
              <p className="m-0">No channels match.</p>
            ) : (
              <div className="overflow-x-auto">
                <table aria-label="Tracked channels" className="w-full text-sm">
                  <thead>
                    <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                      <th className="py-1 pr-3 font-normal">Login</th>
                      <th className="py-1 pr-3 font-normal">Name</th>
                      <th className="py-1 pr-3 font-normal">Status</th>
                      <th className="py-1 pr-3 font-normal">Tracked since</th>
                      <th className="py-1 pr-3 font-normal">Last visited</th>
                      <th className="py-1 pr-3 font-normal">TwitchTracker</th>
                      <th className="py-1 font-normal" />
                    </tr>
                  </thead>
                  <tbody>
                    {channels.data.channels.map((channel) => (
                      <tr key={channel.twitchId}>
                        <td className="py-1 pr-3">{channel.login}</td>
                        <td className="py-1 pr-3">{channel.displayName}</td>
                        <td className="py-1 pr-3">{channel.status}</td>
                        <td className="py-1 pr-3">{channel.trackedSince}</td>
                        <td className="py-1 pr-3">{formatUtc(channel.lastVisitedAt)}</td>
                        <td className="py-1 pr-3">{channel.ttStatus ?? 'none'}</td>
                        <td className="py-1 text-right">
                          <button
                            type="button"
                            aria-label={`Remove and block ${channel.login}`}
                            disabled={pending}
                            onClick={() => setConfirming(channel)}
                            className="rounded border px-2 py-1 text-xs"
                            style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}
                          >
                            Remove and block
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border p-4" style={CARD}>
            <h3 className="m-0 mb-2 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
              Blocked
            </h3>
            {channels.data.blocked.length === 0 ? (
              <p className="m-0">Nothing is blocked.</p>
            ) : (
              <table aria-label="Blocked channels" className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: 'var(--text-muted)' }}>
                    <th className="py-1 pr-3 font-normal">Login</th>
                    <th className="py-1 pr-3 font-normal">Blocked at</th>
                    <th className="py-1 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {channels.data.blocked.map((blocked) => (
                    <tr key={blocked.twitchId}>
                      <td className="py-1 pr-3">{blocked.login}</td>
                      <td className="py-1 pr-3">{formatUtc(blocked.blockedAt)}</td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          aria-label={`Unblock ${blocked.login}`}
                          disabled={pending}
                          onClick={() => void run((signal) => unblockChannel(blocked.twitchId, signal))}
                          className="rounded border px-2 py-1 text-xs"
                          style={{ borderColor: 'var(--border-accent)' }}
                        >
                          Unblock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {confirming !== null && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-remove-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md rounded-lg border p-5" style={CARD}>
            <h3 id="confirm-remove-title" className="m-0 text-base font-semibold">
              Remove and block {confirming.login}?
            </h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              This cannot be undone. {confirming.login}&apos;s saved history is deleted and the channel is blocked from being tracked again until you unblock it.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirming(null)} disabled={pending} className="rounded border px-3 py-1 text-sm" style={{ borderColor: 'var(--border-accent)' }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void run((signal) => removeChannel(confirming.twitchId, signal))}
                className="rounded px-3 py-1 text-sm font-semibold"
                style={{ background: 'var(--accent-red)', color: '#fff' }}
              >
                Remove and block
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
