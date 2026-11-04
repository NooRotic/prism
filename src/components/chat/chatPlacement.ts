export type DockSide = 'left' | 'right'

export interface ChatPlacement {
  side: DockSide
  hidden: boolean
}

/** Docked on the right and visible, which is where the chat has always been. */
export const DEFAULT_PLACEMENT: ChatPlacement = { side: 'right', hidden: false }

/**
 * Anything that is not exactly a valid placement (nothing stored, invalid JSON,
 * a wrong shape, an unknown side) falls back to the default, so a corrupt value
 * can never leave the page without a chat.
 */
export function parsePlacement(raw: string | null): ChatPlacement {
  if (!raw) return { ...DEFAULT_PLACEMENT }
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const { side, hidden } = value as Record<string, unknown>
      if ((side === 'left' || side === 'right') && typeof hidden === 'boolean') {
        return { side, hidden }
      }
    }
  } catch {
    // invalid JSON — fall through to the default
  }
  return { ...DEFAULT_PLACEMENT }
}
