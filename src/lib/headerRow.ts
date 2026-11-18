/**
 * The header's second row: which one is open (a section's tools, or Accounts) and how it was opened.
 * Hover opens a *previewed* row that folds when the pointer leaves; a click, tap or key *pins* it. Being *held* open
 * (a panel or Browse open from it, focus inside it, an import running) stops only the automatic closes.
 */

export type ToolsRowId = 'twitch' | 'youtube'
export type RowId = ToolsRowId | 'accounts'

export interface RowState {
  open: RowId | null
  pinned: boolean
}

export const ROW_CLOSED: RowState = { open: null, pinned: false }

export type RowEvent =
  | { type: 'hoverOpen'; row: ToolsRowId }
  | { type: 'hoverClose' }
  | { type: 'press'; row: RowId }
  /** Esc, a page change, the header hiding: always folds. */
  | { type: 'dismiss' }
  /** A click outside the header, or into a player. */
  | { type: 'outside' }

/** The next state. Returns `state` itself when nothing changes. */
export function nextRow(state: RowState, event: RowEvent, held: boolean): RowState {
  switch (event.type) {
    case 'hoverOpen':
      // A hold keeps an open row as it is; it never stops a folded row from opening.
      if (state.pinned || (held && state.open !== null) || state.open === event.row) return state
      return { open: event.row, pinned: false }
    case 'hoverClose':
      if (state.open === null || state.pinned || held) return state
      return ROW_CLOSED
    case 'press':
      if (state.open === event.row && state.pinned) return ROW_CLOSED
      return { open: event.row, pinned: true }
    case 'dismiss':
      return state.open === null ? state : ROW_CLOSED
    case 'outside':
      if (state.open === null || held) return state
      return ROW_CLOSED
  }
}
