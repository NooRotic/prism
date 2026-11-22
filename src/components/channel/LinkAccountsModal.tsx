import { useState } from 'react'
import { isMutual } from '../../lib/accountBios'
import { findByTwitch, removeLink, saveLink } from '../../lib/linkedAccounts'
import { parseAccountLink } from '../../lib/parseAccountLink'
import { isYouTubeApiAvailable } from '../../lib/youtubeApi'
import { fetchYoutubeChannel } from '../../lib/youtubeChannelApi'

interface LinkAccountsModalProps {
  /** The Twitch channel being linked. */
  login: string
  /** That channel's Twitch bio, for the "do the bios name each other" check. */
  description: string
  onClose: () => void
  /** Called after a link was saved or removed, so the page re-reads the store. */
  onChange: () => void
}

const inputStyle = { backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }

/**
 * "Link accounts": say where else this creator is. The YouTube link is checked (one 1-unit call): when each bio names the
 * other channel it is saved as confirmed, otherwise as the viewer's own claim. A Kick link cannot be checked (Kick's API
 * needs a server-held token), so it is always the viewer's own. Nothing leaves this browser.
 */
export default function LinkAccountsModal({ login, description, onClose, onChange }: LinkAccountsModalProps) {
  const existing = findByTwitch(login)
  const [ytText, setYtText] = useState(existing?.youtube ? existing.youtube.handle || existing.youtube.channelId : '')
  const [kickText, setKickText] = useState(existing?.kick ? `kick.com/${existing.kick.slug}` : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    const yt = ytText.trim() ? parseAccountLink(ytText) : null
    const kick = kickText.trim() ? parseAccountLink(kickText) : null
    if (ytText.trim() && yt?.platform !== 'youtube') return setError("That doesn't look like a YouTube channel link. Use youtube.com/@name or a youtube.com/channel/UC… address.")
    if (kickText.trim() && kick?.platform !== 'kick') return setError("That doesn't look like a Kick channel link (kick.com/name).")
    if (!yt && !kick) return setError('Add a YouTube or Kick link.')

    let youtube: { channelId: string; title: string; handle?: string } | undefined
    let confirmed = false
    if (yt?.platform === 'youtube') {
      if (!isYouTubeApiAvailable()) return setError('YouTube lookups are not available here, so a YouTube link cannot be checked.')
      setBusy(true)
      const result = await fetchYoutubeChannel('handle' in yt ? { handle: yt.handle } : { channelId: yt.channelId })
      setBusy(false)
      if (result.status === 'notfound') return setError('No YouTube channel found for that link.')
      if (result.status === 'error') return setError('Could not reach YouTube. Try again in a moment.')
      const c = result.channel
      youtube = { channelId: c.channelId, title: c.title, ...(c.handle ? { handle: c.handle } : {}) }
      confirmed = isMutual({ twitchLogin: login, twitchDescription: description, youtube: { channelId: c.channelId, handle: c.handle, description: c.description } })
    }
    saveLink({
      twitch: login,
      ...(youtube ? { youtube } : {}),
      ...(kick?.platform === 'kick' ? { kick: { slug: kick.slug } } : {}),
      confirmed,
      linkedAt: Date.now(),
    })
    onChange()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Link accounts"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        className="w-full max-w-md rounded-lg p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Link accounts for {login}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Say where else this creator is. A YouTube link is checked against both bios; it is marked confirmed only when each names the other.
            Links stay in this browser.
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            YouTube channel link or @handle
            <input
              autoFocus
              value={ytText}
              onChange={(e) => setYtText(e.target.value)}
              placeholder="https://www.youtube.com/@name"
              className="rounded px-3 py-2 text-sm"
              style={inputStyle}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Kick channel link (optional)
            <input value={kickText} onChange={(e) => setKickText(e.target.value)} placeholder="https://kick.com/name" className="rounded px-3 py-2 text-sm" style={inputStyle} />
          </label>
          {error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--accent-youtube)' }}>
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            {existing && (
              <button
                type="button"
                onClick={() => {
                  removeLink(login)
                  onChange()
                  onClose()
                }}
                className="mr-auto text-sm cursor-pointer"
                style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
              >
                Remove links
              </button>
            )}
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)' }}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded px-3 py-1.5 text-sm font-medium cursor-pointer disabled:opacity-60"
              style={{ backgroundColor: 'var(--accent-green)', color: '#000', border: 'none' }}
            >
              {busy ? 'Checking…' : 'Check and save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
