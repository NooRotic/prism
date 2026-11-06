import { describe, it, expect } from 'vitest'
import indexCss from '../index.css?raw'

// The text colours are CSS variables, so the only way a test can hold them to a
// readable contrast is to read the hex values out of index.css and do the arithmetic.
// 4.5:1 is the WCAG AA minimum for normal-size text.

/** The #rrggbb value a custom property is declared with in index.css. */
function token(name: string): string {
  const found = indexCss.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))
  if (!found) throw new Error(`${name} is not declared as a #rrggbb colour in index.css`)
  return found[1]
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

const SURFACES = ['--bg', '--bg-card', '--bg-card-hover', '--bg-sidebar'] as const

describe('text colour contrast', () => {
  describe.each(['--text-secondary', '--text-muted'] as const)('%s', (name) => {
    it.each(SURFACES)('is at least 4.5:1 on %s', (surface) => {
      expect(contrast(token(name), token(surface))).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('keeps secondary text clearly brighter than muted text, so the tiers stay distinct', () => {
    const secondary = contrast(token('--text-secondary'), token('--bg-card'))
    const muted = contrast(token('--text-muted'), token('--bg-card'))
    expect(secondary - muted).toBeGreaterThanOrEqual(1.5)
  })

  it('keeps primary text clearly brighter than secondary text', () => {
    const primary = contrast(token('--text-primary'), token('--bg-card'))
    const secondary = contrast(token('--text-secondary'), token('--bg-card'))
    expect(primary - secondary).toBeGreaterThanOrEqual(1.5)
  })
})
