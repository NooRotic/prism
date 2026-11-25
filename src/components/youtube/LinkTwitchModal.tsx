import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { useDialogFocus } from '../../hooks/useDialogFocus'
import { isMutual } from '../../lib/accountBios'
import { linkName, trackEvent } from '../../lib/analytics'
import { findByTwitch, findByYoutube, linkYoutubeToTwitch, unlinkYoutube } from '../../lib/linkedAccounts'
import { parseTwitchLogin } from '../../lib/parseTwitchLink'
import { getUserInfo, SessionExpiredError } from '../../lib/twitchApi'
import { fetchYoutubeChannel } from '../../lib/youtubeChannelApi'

interface LinkTwitchModalProps {
  /** Where focus goes on close when the button that opened the box is gone (see useDialogFocus). */
  returnFocusRef?: RefObject<HTMLElement | null>
  /** The YouTube channel being linked (the video's channel). */
  channelId: string
  /** Its name as the page shows it; also the saved title when YouTube cannot be asked. */
  channelTitle: string
  /** A Twitch login to start the box with (the one the video description names). */
  suggested?: string
  onClose: () => void
}

const inputStyle = { backgroundColor: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }
const SIGN_IN = 'Sign in to Twitch to link this channel.'

/**
 * "Link Twitch": the YouTube page's twin of the Twitch page's "Link accounts", writing the same list. Twitch must know the
 * channel (so a sign-in is needed: Twitch answers no lookup without one); this YouTube channel's description is read
 * (1 unit) so a link both bios name is saved as confirmed. A failed YouTube lookup still saves, as the viewer's claim.
 */
export default function LinkTwitchModal({ channelId, channelTitle, suggested, onClose, returnFocusRef }: LinkTwitchModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useDialogFocus(dialogRef, onClose, returnFocusRef)
  const { isAuthenticated, login, handleAuthError } = useTwitchAuth()
  /** False once the box is closed: a lookup that finishes after Cancel must not save. */
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const existing = findByYoutube(channelId)
  const [text, setText] = useState(existing?.twitch ?? suggested ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  /** The login the viewer was warned about: saving it again replaces that Twitch channel's other YouTube link. */
  const [replaceOk, setReplaceOk] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setNotice(null)
    const wanted = parseTwitchLogin(text)
    if (!wanted) return setError("That doesn't look like a Twitch channel. Use twitch.tv/name or just the name.")

    setBusy(true)
    const [twitch, yt] = await Promise.all([
      getUserInfo(wanted).then(
        (u) => ({ ok: true as const, user: u }),
        (err: unknown) => ({
          ok: false as const,
          err,
          expired: err instanceof SessionExpiredError,
          // Twitch answers an empty list for a name nobody has, and a 400 for a name nobody could have.
          notFound: err instanceof Error && (err.message === 'User not found' || err.message.startsWith('Twitch API error: 400')),
        }),
      ),
      fetchYoutubeChannel({ channelId }),
    ])
    if (!alive.current) return
    setBusy(false)
    if (!twitch.ok) {
      if (twitch.expired) {
        // The stored token is already gone; tell the whole app, not just this box.
        handleAuthError(twitch.err)
        return setExpired(true)
      }
      return setError(twitch.notFound ? 'No Twitch channel found for that name.' : 'Could not reach Twitch. Try again in a moment.')
    }
    const loginName = twitch.user.login.toLowerCase()
    const other = findByTwitch(loginName)?.youtube
    if (other && other.channelId !== channelId && replaceOk !== loginName) {
      setReplaceOk(loginName)
      return setNotice(`${loginName} is linked to ${other.title} on YouTube. Save to replace it.`)
    }

    const youtube =
      yt.status === 'ok'
        ? { channelId, title: yt.channel.title, ...(yt.channel.handle ? { handle: yt.channel.handle } : {}) }
        : { channelId, title: channelTitle }
    const confirmed =
      yt.status === 'ok' &&
      isMutual({ twitchLogin: loginName, twitchDescription: twitch.user.description, youtube: { channelId, handle: yt.channel.handle, description: yt.channel.description } })
    const before = findByTwitch(loginName)
    linkYoutubeToTwitch(loginName, youtube, confirmed)
    // A Kick link already on that Twitch channel stays with it, as linkYoutubeToTwitch keeps it.
    const name = linkName({ twitch: loginName, youtube, ...(before?.kick ? { kick: before.kick } : {}) })
    if (!before || linkName(before) !== name) trackEvent('Linking', 'linked', name)
    onClose()
  }

  const signedOut = !isAuthenticated || expired

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
        aria-label="Link Twitch"
        ref={dialogRef}
        className="w-full max-w-md rounded-lg p-5 flex flex-col gap-4"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
            Link Twitch for {channelTitle}
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Say where this creator streams on Twitch. The link is checked against both bios; it is marked confirmed only when each names the other.{' '}
            {/* CSS shows one of the two: the second only where Matomo is counting (html.counted, see CountedNote). */}
            <span className="uncounted-note">Links stay in this browser.</span>
            <span className="counted-note">Links are kept in this browser. Which accounts are linked is counted, without your name.</span>
          </p>
        </div>
        {signedOut ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {SIGN_IN}
            </p>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)', background: 'none', border: '1px solid var(--border)' }}>
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={login}
                className="rounded px-3 py-1.5 text-sm font-medium cursor-pointer"
                style={{ backgroundColor: 'var(--accent-twitch)', color: '#fff', border: 'none' }}
              >
                Sign in with Twitch
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Their Twitch channel
              <input
                autoFocus
                value={text}
                onChange={(e) => {
                  setText(e.target.value)
                  setNotice(null)
                }}
                placeholder="https://www.twitch.tv/name"
                className="rounded px-3 py-2 text-sm"
                style={inputStyle}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm" style={{ color: 'var(--accent-youtube)' }}>
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm" style={{ color: 'var(--text-primary)' }}>
                {notice}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {existing && (
                <button
                  type="button"
                  onClick={() => {
                    // Only the YouTube part goes; a Kick link stays.
                    trackEvent('Linking', 'unlinked', linkName({ twitch: existing.twitch, youtube: existing.youtube }))
                    unlinkYoutube(channelId)
                    onClose()
                  }}
                  className="mr-auto text-sm cursor-pointer"
                  style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
                >
                  Remove link
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
        )}
      </div>
    </div>
  )
}
