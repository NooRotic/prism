import { Lock, LogIn } from 'lucide-react'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'

export function FavoritesCard() {
  const { isAuthenticated, login } = useTwitchAuth()

  if (isAuthenticated) return null

  return (
    <div
      className="rounded flex flex-col items-center justify-center gap-3 p-6 text-center"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--accent-twitch)',
        borderRadius: '4px',
        opacity: 0.7,
      }}
    >
      <Lock size={24} style={{ color: 'var(--accent-twitch)' }} />
      <span className="text-sm font-medium" style={{ color: 'var(--accent-twitch)' }}>
        Your Favorites
      </span>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Connect Twitch to see your followed channels
      </p>
      <button
        type="button"
        onClick={login}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.02] mt-1"
        style={{
          background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          letterSpacing: '0.05em',
        }}
      >
        <LogIn size={12} />
        connect twitch
      </button>
    </div>
  )
}
