import { useRef, useState } from 'react'
import { Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useApp } from '../../contexts/AppContext'
import { useHeaderHeight } from '../../hooks/useHeaderHeight'
import { useHeaderRow } from '../../hooks/useHeaderRow'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { useYoutubeAccount } from '../../hooks/useYoutubeAccount'
import { nextRow, type RowId } from '../../lib/headerRow'
import { SECTIONS, sectionForPath, showsHeaderPaste } from '../../lib/headerSections'
import { PrismMark } from '../brand/PrismMark'
import { SmartUrlInput } from '../search/SmartUrlInput'
import { AccountsPill } from './AccountsPill'
import { AccountsRow } from './AccountsRow'
import { FoldingRow } from './FoldingRow'
import { SectionTabs } from './SectionTabs'
import { TwitchTools } from './TwitchTools'

const ROW_ITEM_STYLE = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem', letterSpacing: '0.05em' } as const

export function Header() {
  const { state, dispatch } = useApp()
  const debugMode = state.player.debugMode
  const wide = useMediaQuery('(min-width: 640px)')
  const { pathname } = useLocation()
  const current = sectionForPath(pathname)
  const currentColor = SECTIONS.find((s) => s.id === current)?.color ?? 'transparent'

  // The header's height is whatever its content needs (the second row unfolds inside it), published as
  // --header-height for the panels, rail and pages that sit under it.
  const headerRef = useRef<HTMLElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  useHeaderHeight(headerRef)

  // Browse belongs to the page it was opened on: changing page closes it, with no effect to run.
  const [browseOpenOn, setBrowseOpenOn] = useState<string | null>(null)
  const browseOpen = browseOpenOn === pathname
  const setBrowseOpen = (open: boolean) => setBrowseOpenOn(open ? pathname : null)

  const { importing } = useYoutubeAccount()
  const row = useHeaderRow(headerRef, rowRef, { navPanelOpen: state.navPanel.open !== null, browseOpen, importing })

  // When a press takes the Twitch row away, its panels go with it: their buttons are about to leave the page.
  const pressRow = (id: RowId, trigger: HTMLElement) => {
    if (row.state.open === 'twitch' && nextRow(row.state, { type: 'press', row: id }, false).open !== 'twitch') {
      setBrowseOpen(false)
      dispatch({ type: 'CLOSE_NAV_PANEL' })
    }
    row.press(id, trigger)
  }

  // The row keeps showing what it last held while it folds away.
  const [shownRow, setShownRow] = useState<RowId | null>(null)
  if (row.state.open !== null && row.state.open !== shownRow) setShownRow(row.state.open)

  // Only show SmartUrlInput in header when the page has none of its own: the hub has one, and the Twitch and YouTube
  // listings have it in their sidebar. /hls-dash is not one of them any more (it is a player page with no sidebar).
  const showHeaderInput = showsHeaderPaste(pathname)

  return (
    <header
      ref={headerRef}
      className="fill-hide relative z-40"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(180deg, var(--bg-sidebar), rgba(8, 8, 12, 0.8))',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        data-header-bar
        data-section={current ?? 'none'}
        className="relative flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-6"
        // The current section's colour along the bottom of the bar says there is more underneath.
        style={{ boxShadow: `inset 0 -2px 0 ${currentColor}` }}
      >
        <Link
          to="/"
          aria-label="Return to home"
          className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
        >
          <PrismMark variant="icon" hover className="h-8 w-16 shrink-0" />
          <h1
            className="font-heading text-lg select-none"
            style={{ color: 'var(--accent-green)', letterSpacing: '0.15em' }}
          >
            PRISM
          </h1>
        </Link>
        <SectionTabs current={current} row={row} onPress={pressRow} />
        <div className="flex-1" />

      <div data-header-actions className="flex items-center gap-3">
        {/* On a phone the paste box takes what the buttons leave (it cannot shrink on its own); from 640 px up it is its own size. */}
        {showHeaderInput && (
          <div className="min-w-0 flex-1 sm:flex-none">
            <SmartUrlInput />
          </div>
        )}

        {/* Debug toggle lives here, not over the player: anything drawn on top
            of the Twitch embed makes its visibility check fail and disables
            autoplay. Below 640 px there is no room in the bar: it moves into the
            Accounts row (only ever one of the two exists). */}
        {wide && (
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
        )}

        <AccountsPill expanded={row.state.open === 'accounts'} onPress={(trigger) => pressRow('accounts', trigger)} />
      </div>
      </div>

      <FoldingRow open={row.state.open !== null} row={row} rowRef={rowRef}>
        {shownRow === 'accounts' && <AccountsRow showDebugToggle={!wide} />}
        {shownRow === 'twitch' && <TwitchTools browseOpen={browseOpen} onBrowseOpenChange={setBrowseOpen} />}
        {shownRow === 'youtube' && (
          <Link
            to="/youtube/catchup"
            className="whitespace-nowrap rounded-md px-2 py-1 transition-colors duration-150 hover:bg-white/10 sm:px-3"
            style={{ ...ROW_ITEM_STYLE, color: 'var(--text-secondary)' }}
          >
            Catch up
          </Link>
        )}
      </FoldingRow>
    </header>
  )
}
