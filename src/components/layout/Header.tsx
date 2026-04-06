import { LogIn, LogOut } from 'lucide-react'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { SmartUrlInput } from '../search/SmartUrlInput'

export function Header() {
  const { isAuthenticated, login, logout } = useTwitchAuth()

  return (
    <header
      className="flex items-center justify-between px-6 py-3 relative z-10"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(180deg, var(--bg-sidebar), rgba(8, 8, 12, 0.8))',
        backdropFilter: 'blur(12px)',
      }}
    >
      <h1
        className="font-heading text-lg select-none"
        style={{ color: 'var(--accent-green)', letterSpacing: '0.15em' }}
      >
        GLAZE ME
      </h1>

      <div className="flex items-center gap-3">
        <SmartUrlInput />

        {isAuthenticated ? (
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.02]"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
            }}
          >
            <LogOut size={13} />
            logout
          </button>
        ) : (
          <button
            type="button"
            onClick={login}
            className="flex items-center gap-2 px-4 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
            style={{
              background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)',
              color: '#fff',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              fontWeight: 500,
              letterSpacing: '0.05em',
              boxShadow: '0 0 20px var(--accent-twitch-glow)',
            }}
          >
            <LogIn size={13} />
            connect twitch
          </button>
        )}
      </div>
    </header>
  )
}
