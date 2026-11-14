import { useRef } from 'react'
import { LogIn, LogOut, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../../contexts/AppContext'
import { useHeaderHeight } from '../../hooks/useHeaderHeight'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { SmartUrlInput } from '../search/SmartUrlInput'
import HeaderNav from './HeaderNav'

export function Header() {
  const { isAuthenticated, login, logout } = useTwitchAuth()
  const { state, dispatch } = useApp()
  const debugMode = state.player.debugMode
  const location = useLocation()

  // On a phone the logo, the nav, the paste box and the buttons do not fit one row (the page used to scroll sideways): below
  // 640 px the actions wrap onto a second row, so the header's height is whatever its content needs, published for the
  // panels, rail and pages that sit under it.
  const headerRef = useRef<HTMLElement | null>(null)
  useHeaderHeight(headerRef)

  // Only show SmartUrlInput in header when the page has none of its own: the hub has one, and the Twitch and YouTube
  // listings have it in their sidebar. /hls-dash is not one of them any more (it is a player page with no sidebar).
  const isHub = location.pathname === '/'
  const isProtocolListing = ['/twitch', '/youtube'].includes(location.pathname)
  const showHeaderInput = !isHub && !isProtocolListing

  return (
    <header
      ref={headerRef}
      className="fill-hide flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-6 relative z-40 min-h-14"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(180deg, var(--bg-sidebar), rgba(8, 8, 12, 0.8))',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div data-header-brand className="flex flex-wrap items-center gap-y-1">
        <Link
          to="/"
          aria-label="Return to home"
          className="transition-opacity hover:opacity-80"
        >
          <h1
            className="font-heading text-lg select-none"
            style={{ color: 'var(--accent-green)', letterSpacing: '0.15em' }}
          >
            PRISM
          </h1>
        </Link>
        {isAuthenticated && <HeaderNav />}
      </div>

      <div data-header-actions className="flex w-full items-center gap-3 sm:w-auto">
        {/* On a phone the paste box takes what the buttons leave (it cannot shrink on its own); from 640 px up it is its own size. */}
        {showHeaderInput && (
          <div className="min-w-0 flex-1 sm:flex-none">
            <SmartUrlInput />
          </div>
        )}

        {/* Debug toggle lives here, not over the player: anything drawn on top
            of the Twitch embed makes its visibility check fail and disables
            autoplay. */}
        <button
          type="button"
          onClick={() => dispatch({ type: 'TOGGLE_DEBUG' })}
          className="p-1.5 rounded-md transition-colors duration-150 hover:bg-white/10"
          style={{ color: debugMode ? 'var(--accent-green)' : 'var(--text-muted)' }}
          title="Toggle debug overlay"
          aria-label="Toggle debug overlay"
          aria-pressed={debugMode}
        >
          <Settings size={16} />
        </button>

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
