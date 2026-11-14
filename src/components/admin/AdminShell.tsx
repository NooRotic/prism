import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'

interface AdminShellProps {
  onSignOut: () => void
  children: ReactNode
}

const SCREENS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/usage', label: 'Usage', end: false },
  { to: '/admin/tt', label: 'TT calls', end: false },
  { to: '/admin/security', label: 'Security', end: false },
  { to: '/admin/channels', label: 'Channels', end: false },
  { to: '/admin/playlist', label: 'Playlist', end: false },
]

/** A later piece: shown so the owner sees where the playlist's health will live, but not a link yet. */
const COMING_LATER = ['Health']

/** The admin layout: a menu down the left (a row above the screen on a narrow window) and the screen beside it. */
export default function AdminShell({ onSignOut, children }: AdminShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 md:flex-row md:gap-6">
      <aside className="md:w-48 md:shrink-0">
        <h1 className="font-heading text-lg" style={{ color: 'var(--accent-green)' }}>
          PRISM admin
        </h1>
        <nav aria-label="Admin sections" className="mt-3 flex flex-row flex-wrap gap-1 md:flex-col">
          {SCREENS.map((screen) => (
            <NavLink
              key={screen.to}
              to={screen.to}
              end={screen.end}
              className="rounded px-3 py-2 text-sm"
              style={({ isActive }) => ({
                background: isActive ? 'var(--bg-card-hover)' : 'transparent',
                color: isActive ? 'var(--accent-green)' : 'var(--text-primary)',
              })}
            >
              {screen.label}
            </NavLink>
          ))}
          {COMING_LATER.map((label) => (
            <span key={label} aria-disabled="true" className="rounded px-3 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {label} <small>coming later</small>
            </span>
          ))}
        </nav>
        <div className="mt-4 flex flex-col items-start gap-2 text-sm">
          <button type="button" onClick={onSignOut} className="rounded border px-3 py-1" style={{ borderColor: 'var(--border-accent)' }}>
            Sign out
          </button>
          <Link to="/" style={{ color: 'var(--text-secondary)' }}>
            Back to PRISM
          </Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}
