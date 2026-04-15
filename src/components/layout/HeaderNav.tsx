import { useCallback } from 'react'
import { useApp } from '../../contexts/AppContext'
import type { NavPanelId } from '../../contexts/AppContext'

interface NavItem {
  id: NavPanelId
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'following', label: 'Following' },
  { id: 'your-stats', label: 'Your Stats' },
]

/**
 * Header-level nav list. Each item toggles a slide-down panel. The
 * currently-open panel id lives in AppContext so ESC handling, click-
 * outside dismissal, and programmatic close (e.g. from a card click)
 * can all operate from one place.
 */
export default function HeaderNav() {
  const { state, dispatch } = useApp()
  const openPanel = state.navPanel.open

  const toggle = useCallback(
    (id: NavPanelId) => {
      dispatch({ type: 'TOGGLE_NAV_PANEL', panel: id })
    },
    [dispatch],
  )

  return (
    <nav
      aria-label="Main navigation"
      className="flex items-center gap-1 ml-4"
      data-nav-trigger
    >
      {NAV_ITEMS.map((item) => {
        const active = openPanel === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            aria-expanded={active}
            aria-controls={`nav-panel-${item.id}`}
            className="px-3 py-1.5 rounded-md transition-all duration-150"
            style={{
              color: active
                ? 'var(--accent-green)'
                : 'var(--text-secondary)',
              backgroundColor: active
                ? 'rgba(57, 255, 20, 0.1)'
                : 'transparent',
              border: `1px solid ${active ? 'var(--accent-green)' : 'transparent'}`,
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              letterSpacing: '0.05em',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}
