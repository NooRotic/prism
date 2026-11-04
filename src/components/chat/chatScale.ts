/** Chat text size as a multiplier, 70% to 200% around a default of 100%. */
export const CHAT_SCALE_STEPS = [0.7, 0.85, 1, 1.15, 1.3, 1.5, 1.75, 2] as const

export const DEFAULT_CHAT_SCALE = 1

/**
 * Only an exact step value is accepted; anything else saved (garbage, a value
 * between steps, out of range) means the default, so a bad value can never leave
 * the chat unreadably tiny or huge.
 */
export function parseChatScale(raw: string | null): number {
  if (raw === null || raw.trim() === '') return DEFAULT_CHAT_SCALE
  const value = Number(raw)
  return (CHAT_SCALE_STEPS as readonly number[]).includes(value) ? value : DEFAULT_CHAT_SCALE
}

/** One step up or down from the nearest step, stopping at both ends. */
export function stepScale(current: number, direction: 1 | -1): number {
  let nearest = 0
  CHAT_SCALE_STEPS.forEach((step, index) => {
    if (Math.abs(step - current) < Math.abs(CHAT_SCALE_STEPS[nearest] - current)) nearest = index
  })
  const target = Math.min(CHAT_SCALE_STEPS.length - 1, Math.max(0, nearest + direction))
  return CHAT_SCALE_STEPS[target]
}
