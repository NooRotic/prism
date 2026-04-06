import { LogIn, LogOut } from 'lucide-react'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { SmartUrlInput } from '../search/SmartUrlInput'

export function Header() {
  const { isAuthenticated, login, logout } = useTwitchAuth()

  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-sidebar)]">
      <h1
        className="text-xl font-bold tracking-wider select-none"
        style={{ fontFamily: 'var(--font-heading)', color: 'var(--accent-green)' }}
      >
        GLAZE ME
      </h1>

      <div className="flex items-center gap-3">
        <SmartUrlInput />

        {isAuthenticated ? (
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] text-sm px-3 py-1.5 rounded hover:border-[var(--accent-red)] hover:text-[var(--accent-red)] transition-colors"
          >
            <LogOut size={14} />
            Logout
          </button>
        ) : (
          <button
            type="button"
            onClick={login}
            className="flex items-center gap-1.5 bg-[var(--accent-twitch)] text-white text-sm px-4 py-1.5 rounded hover:opacity-90 transition-opacity"
          >
            <LogIn size={14} />
            Login with Twitch
          </button>
        )}
      </div>
    </header>
  )
}
