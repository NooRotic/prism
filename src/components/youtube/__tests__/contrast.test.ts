import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TAG_CHIP_BG } from '../TagChip'

const css = readFileSync('src/index.css', 'utf8')
const token = (name: string) => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))![1]

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('tag chip contrast', () => {
  it('meets WCAG AA (4.5:1) for its text on its background', () => {
    expect(ratio(token('--text-primary'), TAG_CHIP_BG)).toBeGreaterThanOrEqual(4.5)
  })
  it('sits visibly apart from the card it is on', () => {
    expect(TAG_CHIP_BG).not.toBe(token('--bg-card'))
  })
})
