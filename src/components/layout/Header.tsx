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
import { PasteToggle } from './PasteToggle'
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
  // Leaving the page forgets it, so coming Back does not re-open it by itself.
  if (browseOpenOn !== null && browseOpenOn !== pathname) setBrowseOpenOn(null)
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

  // The paste box only where the page has none of its own (the hub has one, and the Twitch and YouTube listings have
  // it in their sidebar), behind a link icon. Like Browse, it belongs to the page it was opened on. Its suggestion
  // list goes into a slot in the header's flow, so it pushes the page down instead of covering a player.
  const showHeaderInput = showsHeaderPaste(pathname)
  const [pasteOpenOn, setPasteOpenOn] = useState<string | null>(null)
  if (pasteOpenOn !== null && pasteOpenOn !== pathname) setPasteOpenOn(null)
  const pasteOpen = showHeaderInput && pasteOpenOn === pathname
  const [pasteList, setPasteList] = useState<HTMLDivElement | null>(null)

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
        // One row at every width: below 640 px the gaps tighten, the wordmark hides and the mark shrinks (measured
        // 2026-11-18: 491 px of content at 360 px before that). If it still does not fit, the tab strip scrolls inside
        // itself; the page never scrolls sideways.
        className="relative flex min-h-14 flex-nowrap items-center gap-x-1 px-3 py-2 max-[359px]:px-2 sm:gap-x-3 sm:px-6"
        // The current section's colour along the bottom of the bar says there is more underneath.
        style={{ boxShadow: `inset 0 -2px 0 ${currentColor}` }}
      >
        <Link
          to="/"
          aria-label="Return to home"
          className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-80"
        >
          <PrismMark variant="icon" hover className="h-5 w-10 shrink-0 sm:h-8 sm:w-16" />
          <h1
            // Only the mark below 768 px (at 640 px the wordmark clipped the tabs); up to 800 px the open paste box needs
            // the wordmark's room too.
            className={`hidden font-heading text-lg select-none md:inline ${pasteOpen ? 'max-[800px]:hidden' : ''}`}
            style={{ color: 'var(--accent-green)', letterSpacing: '0.15em' }}
          >
            PRISM
          </h1>
        </Link>
        <SectionTabs current={current} row={row} onPress={pressRow} />
        <div className="min-w-0 flex-1" />

      <div data-header-actions className="flex shrink-0 items-center gap-1 sm:gap-3">
        {showHeaderInput && (
          <PasteToggle
            open={pasteOpen}
            onOpenChange={(open) => setPasteOpenOn(open ? pathname : null)}
            listContainer={pasteList}
          />
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

      <div id="header-paste-list" ref={setPasteList} className="max-h-64 overflow-y-auto px-3 sm:px-6" />

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
