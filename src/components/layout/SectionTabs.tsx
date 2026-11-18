import { ChevronDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { HeaderRow } from '../../hooks/useHeaderRow'
import type { RowId, ToolsRowId } from '../../lib/headerRow'
import { SECTIONS, type SectionId } from '../../lib/headerSections'

interface SectionTabsProps {
  current: SectionId | null
  row: HeaderRow
  /** A ▾ was pressed (the header closes Twitch's panels first when another row replaces Twitch's). */
  onPress(row: RowId, trigger: HTMLElement): void
}

/**
 * Twitch, YouTube and HLS/DASH, on every page. The label goes to the section; the ▾ beside a section that has tools
 * opens its row, and so does resting a mouse on the tab (see useHeaderRow).
 */
export function SectionTabs({ current, row, onPress }: SectionTabsProps) {
  return (
    <nav
      aria-label="Sections"
      // Shrinks first and scrolls inside itself when a very narrow screen cannot fit it: never the page.
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:gap-1"
    >
      {SECTIONS.map((section) => {
        const isCurrent = current === section.id
        const expanded = row.state.open === section.id
        const hover = section.hasTools ? row.tabHoverProps(section.id as ToolsRowId) : undefined
        return (
          <div
            key={section.id}
            className="flex shrink-0 items-center rounded-md transition-colors duration-150"
            style={{
              backgroundColor: isCurrent ? `color-mix(in srgb, ${section.color} 14%, transparent)` : 'transparent',
              border: `1px solid ${isCurrent ? section.color : 'transparent'}`,
            }}
            {...hover}
          >
            <Link
              to={section.path}
              aria-label={section.label}
              aria-current={isCurrent ? 'page' : undefined}
              className="flex items-center gap-1.5 whitespace-nowrap py-1 pr-1 pl-1.5 tracking-normal max-[359px]:pr-0.5 max-[359px]:pl-1 sm:pr-1.5 sm:pl-2.5 sm:tracking-[0.05em]"
              style={{
                color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.75rem',
              }}
            >
              <span aria-hidden="true" className="hidden h-1.5 w-1.5 shrink-0 rounded-full sm:inline-block" style={{ backgroundColor: section.color }} />
              {section.shortLabel === section.label ? (
                section.label
              ) : (
                <>
                  <span className="hidden sm:inline">{section.label}</span>
                  <span className="sm:hidden">{section.shortLabel}</span>
                </>
              )}
            </Link>
            {section.hasTools && (
              <button
                type="button"
                aria-label={`${section.label} tools`}
                aria-expanded={expanded}
                aria-controls="header-row"
                onClick={(e) => onPress(section.id as ToolsRowId, e.currentTarget)}
                className="flex h-7 items-center rounded-md pr-1 pl-0.5 transition-colors duration-150 hover:bg-white/10 max-[359px]:pr-0.5 sm:pr-1.5"
                style={{ color: expanded ? 'var(--accent-green)' : 'var(--text-muted)' }}
              >
                <ChevronDown size={13} className={`transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        )
      })}
    </nav>
  )
}
