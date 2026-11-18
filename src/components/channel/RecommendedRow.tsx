import { useState } from 'react'
import { Link } from 'react-router-dom'
import { clearRecommended, getRecommended } from '../../lib/recommendedStore'

/** The Twitch channels Twitch itself recommended to the owner, as sent by the PRISM helper extension. Hidden until imported. */
export default function RecommendedRow() {
  const [saved, setSaved] = useState(() => getRecommended())
  if (!saved) return null

  const date = new Date(saved.importedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  return (
    <section
      aria-label="Recommended by Twitch"
      className="mb-6 rounded-lg p-3 flex flex-col gap-2"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-heading uppercase tracking-wider" style={{ color: 'var(--accent-twitch)' }}>
          Recommended by Twitch
        </h3>
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {`imported ${date}`}
        </span>
        <button
          type="button"
          className="ml-auto rounded px-2 py-0.5 text-xs"
          style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          onClick={() => {
            clearRecommended()
            setSaved(null)
          }}
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {saved.logins.map((login) => (
          <Link
            key={login}
            to={`/twitch/${login}`}
            className="rounded px-2.5 py-1 text-sm font-mono"
            style={{ border: '1px solid var(--accent-twitch)', color: 'var(--text-primary)' }}
          >
            {login}
          </Link>
        ))}
      </div>
    </section>
  )
}
