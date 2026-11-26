import { useEffect, useState } from 'react'
import { setTvQrStyle } from '../../lib/adminApi'
import { QR_STYLES, shareUrl, type QrStyle } from '../../lib/cast/qrCode'
import { loadStreamSnapshot } from '../../lib/streamsApi'
import { fetchTvSettings } from '../../lib/tvSettingsApi'
import QrCode from '../cast/QrCode'
import { useAdminSession } from './AdminSessionContext'

const CARD = { background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }
/** A channel every list has, for when the server's list cannot be read. */
const FALLBACK_ID = 'bbb-hls'

const ABOUT: Record<QrStyle, string> = {
  a: 'PRISM colours on a light card. Strong contrast for any camera.',
  b: 'Rainbow dots on near-black, like the TV page. Read by the Galaxy Fold5; light-on-dark codes are not read by every camera.',
  c: 'Near-black dots, colour only in the corners. The safest to scan.',
}

/**
 * The owner's TV settings: the look of the QR code on the TV's share card. Each style is drawn with a real channel's link, so
 * it can be scanned from this screen. The current style comes from the public setting the TV reads (asked past any cache).
 */
export default function TvScreen() {
  const { onExpired } = useAdminSession()
  const [current, setCurrent] = useState<QrStyle | null>(null)
  const [known, setKnown] = useState<'asking' | 'known' | 'unknown'>('asking')
  const [channelId, setChannelId] = useState(FALLBACK_ID)
  const [saving, setSaving] = useState<QrStyle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    void fetchTvSettings().then((settings) => {
      if (!live) return
      setCurrent(settings?.qrStyle ?? null)
      setKnown(settings ? 'known' : 'unknown')
    })
    void loadStreamSnapshot().then((result) => {
      if (!live || result.kind !== 'ready') return
      const id = result.snapshot.defaultId ?? result.snapshot.streams[0]?.id
      if (id) setChannelId(id)
    })
    return () => {
      live = false
    }
  }, [])

  const choose = async (style: QrStyle) => {
    setSaving(style)
    setError(null)
    const result = await setTvQrStyle(style)
    setSaving(null)
    if (result.kind === 'ok') {
      setCurrent(result.data.qrStyle)
      setKnown('known')
    } else if (result.kind === 'signed_out') {
      onExpired()
    } else {
      setError('Could not change the style: the server did not take it. Try again in a moment.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="m-0 text-lg font-semibold">TV</h2>
      <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>
        The QR code on the TV&apos;s share card (Left or Right on the remote) opens the channel in PRISM on a phone.
      </p>
      <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>
        The TV uses the new style the next time its code is shown.
      </p>
      {known === 'unknown' && (
        <p role="status" className="m-0 text-sm" style={{ color: 'var(--accent-orange)' }}>
          Cannot reach the server to see which style the TV uses.
        </p>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm" style={{ color: 'var(--accent-red)' }}>
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {QR_STYLES.map((style) => {
          const letter = style.toUpperCase()
          const inUse = current === style
          return (
            <section key={style} aria-label={`Style ${letter}`} className="flex flex-col gap-3 rounded-lg border p-4" style={CARD}>
              <div className="flex items-center justify-between">
                <h3 className="m-0 text-base font-semibold">Style {letter}</h3>
                {inUse && (
                  <span className="rounded px-2 py-0.5 text-xs" style={{ background: 'var(--accent-hls)', color: '#fff' }}>
                    In use
                  </span>
                )}
              </div>
              <QrCode text={shareUrl(channelId)} styleName={style} className="mx-auto w-full max-w-[220px]" />
              <p className="m-0 text-sm" style={{ color: 'var(--text-secondary)' }}>
                {ABOUT[style]}
              </p>
              <button
                type="button"
                onClick={() => void choose(style)}
                disabled={inUse || saving !== null}
                className="rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: 'var(--border-accent)' }}
              >
                {saving === style ? 'Saving…' : 'Use this style'}
              </button>
            </section>
          )
        })}
      </div>
    </div>
  )
}
