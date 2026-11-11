/** The card colour the dashboard's identity strip sits on (`--bg-card`). */
export const DASHBOARD_BG = '#0c0c10'

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/

function parse(hex: string): [number, number, number] | null {
  if (!HEX_COLOUR.test(hex)) return null
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
}

function toHex(channels: number[]): string {
  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/** WCAG relative luminance of an sRGB colour. */
function luminance([r, g, b]: [number, number, number]): number {
  const linear = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** WCAG contrast ratio between two `#RRGGBB` colours, or null if either is not one. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parse(foreground)
  const bg = parse(background)
  if (!fg || !bg) return null
  const [lighter, darker] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * The colour itself when it already reaches `min` contrast on the background;
 * otherwise the nearest lighter mix toward white that does (as Twitch's own chat
 * does for dark name colours). Null when the colour is not a `#RRGGBB` string.
 */
export function ensureContrast(color: string, background: string = DASHBOARD_BG, min = 4.5): string | null {
  const channels = parse(color)
  if (!channels) return null
  const ratio = contrastRatio(color, background)
  if (ratio === null) return null
  if (ratio >= min) return color

  for (let step = 1; step <= 20; step++) {
    const t = step * 0.05
    const mixed = toHex(channels.map((c) => Math.round(c + (255 - c) * t)))
    if ((contrastRatio(mixed, background) ?? 0) >= min) return mixed
  }
  return '#FFFFFF'
}
