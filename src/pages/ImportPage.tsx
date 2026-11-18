import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getWatchLater, setWatchLater } from '../lib/catchupStore'
import { parseImportFragment } from '../lib/extensionImport'
import { setRecommended } from '../lib/recommendedStore'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * Where the PRISM helper extension lands (`/import#v=1&kind=...`). Anyone can craft that address, so nothing is
 * stored until the owner presses Save, and what is shown is what is saved (the parser has already dropped bad entries).
 */
export default function ImportPage() {
  const { hash } = useLocation()
  const navigate = useNavigate()
  const payload = parseImportFragment(hash)

  if (!payload) {
    return (
      <div className="w-full max-w-xl mx-auto px-4 pt-8 flex flex-col gap-3">
        <h2 className="text-lg font-bold font-heading uppercase tracking-wider">Import</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Nothing to import. This page opens from the PRISM helper extension when you press Send to PRISM.
        </p>
        <Link to="/" className="text-sm underline">
          Back to the PRISM home
        </Link>
      </div>
    )
  }

  const existing = payload.kind === 'watch-later' ? getWatchLater().length : 0
  const what =
    payload.kind === 'watch-later'
      ? `sent ${plural(payload.ids.length, 'Watch Later video', 'Watch Later videos')}`
      : `sent ${plural(payload.logins.length, 'recommended Twitch channel', 'recommended Twitch channels')}`

  const save = () => {
    if (payload.kind === 'watch-later') {
      setWatchLater(payload.ids)
      navigate('/youtube/catchup', { replace: true })
    } else {
      setRecommended(payload.logins)
      navigate('/twitch', { replace: true })
    }
  }

  return (
    <div className="w-full max-w-xl mx-auto px-4 pt-8 flex flex-col gap-3">
      <h2 className="text-lg font-bold font-heading uppercase tracking-wider">Import</h2>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
        {`The PRISM helper ${what}.`}
      </p>
      {existing > 0 && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {`Saving replaces the ${plural(existing, 'video', 'videos')} you already have saved.`}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm"
          style={{ backgroundColor: 'var(--accent-green)', color: '#111' }}
          onClick={save}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          onClick={() => navigate('/', { replace: true })}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
