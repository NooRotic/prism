import { useCallback, useRef } from 'react'
import { useApp, type NavPanelId } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import ChannelSearchDropdown from '../search/ChannelSearchDropdown'

const NAV_ITEMS: { id: NavPanelId; label: string }[] = [
  { id: 'following', label: 'Following' },
  { id: 'your-stats', label: 'Your Stats' },
]

const ITEM_STYLE = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  letterSpacing: '0.05em',
} as const

interface TwitchToolsProps {
  browseOpen: boolean
  onBrowseOpenChange(open: boolean): void
}

/**
 * Twitch's row: Following and Your Stats (the slide-down panels; the open one lives in AppContext so Esc,
 * click-outside and a card click can all close it) and Browse. Signed out, one line and a way to connect.
 */
export function TwitchTools({ browseOpen, onBrowseOpenChange }: TwitchToolsProps) {
  const { isAuthenticated, login } = useTwitchAuth()
  const { state, dispatch } = useApp()
  const openPanel = state.navPanel.open
  const browseButton = useRef<HTMLButtonElement | null>(null)

  const toggle = useCallback(
    (id: NavPanelId) => {
      onBrowseOpenChange(false)
      dispatch({ type: 'TOGGLE_NAV_PANEL', panel: id })
    },
    [dispatch, onBrowseOpenChange],
  )

  const toggleBrowse = useCallback(() => {
    dispatch({ type: 'CLOSE_NAV_PANEL' })
    onBrowseOpenChange(!browseOpen)
  }, [browseOpen, dispatch, onBrowseOpenChange])

  const closeBrowse = useCallback(() => onBrowseOpenChange(false), [onBrowseOpenChange])

  if (!isAuthenticated) {
    return (
      <div className="flex flex-wrap items-center gap-2" style={{ ...ITEM_STYLE, color: 'var(--text-secondary)' }}>
        <span>Connect Twitch to see Following, Your Stats and Browse</span>
        <button
          type="button"
          onClick={login}
          className="rounded-md px-3 py-1 text-white transition-transform duration-150 hover:scale-[1.02]"
          style={{ ...ITEM_STYLE, background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)' }}
        >
          Connect
        </button>
      </div>
    )
  }

  // The click-outside check of the slide-down panels treats mousedowns inside this element as the toggle's own.
  return (
    <div className="flex items-center gap-1" data-nav-trigger>
      {NAV_ITEMS.map((item) => {
        const active = openPanel === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            aria-expanded={active}
            aria-controls={`nav-panel-${item.id}`}
            className="whitespace-nowrap rounded-md px-2 py-1 transition-all duration-150 sm:px-3"
            style={{
              ...ITEM_STYLE,
              color: active ? 'var(--accent-green)' : 'var(--text-secondary)',
              backgroundColor: active ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
              border: `1px solid ${active ? 'var(--accent-green)' : 'transparent'}`,
            }}
          >
            {item.label}
          </button>
        )
      })}
      <div className="relative">
        <button
          ref={browseButton}
          type="button"
          onClick={toggleBrowse}
          aria-expanded={browseOpen}
          className="whitespace-nowrap rounded-md px-2 py-1 transition-all duration-150 sm:px-3"
          style={{
            ...ITEM_STYLE,
            color: browseOpen ? 'var(--accent-twitch)' : 'var(--text-secondary)',
            backgroundColor: browseOpen ? 'rgba(145, 70, 255, 0.1)' : 'transparent',
            border: `1px solid ${browseOpen ? 'var(--accent-twitch)' : 'transparent'}`,
          }}
        >
          Browse
        </button>
        {browseOpen && <ChannelSearchDropdown open onClose={closeBrowse} anchorRef={browseButton} />}
      </div>
    </div>
  )
}
