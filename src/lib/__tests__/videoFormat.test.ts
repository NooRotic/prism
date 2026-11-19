import { describe, expect, it } from 'vitest'
import { formatCount, formatPublished, linkify } from '../videoFormat'

describe('formatCount', () => {
  it('shortens millions and thousands', () => {
    expect(formatCount('1234567')).toBe('1.2M')
    expect(formatCount(34_000)).toBe('34K')
    expect(formatCount('1712345678')).toBe('1.7B')
  })
  it('keeps small numbers whole', () => {
    expect(formatCount('999')).toBe('999')
  })
  it('is empty for nothing or junk', () => {
    expect(formatCount(undefined)).toBe('')
    expect(formatCount('abc')).toBe('')
  })
})

describe('formatPublished', () => {
  const now = Date.parse('2026-11-18T12:00:00Z')
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString()
  it('is relative under a year', () => {
    expect(formatPublished(ago(3), now)).toBe('3 days ago')
    expect(formatPublished(ago(40), now)).toBe('1 month ago')
    expect(formatPublished(ago(0), now)).toBe('today')
  })
  it('is a calendar date from a year on', () => {
    expect(formatPublished(ago(400), now)).toContain('2025')
  })
  it('is empty when unparsable', () => {
    expect(formatPublished('nope', now)).toBe('')
  })
})

describe('linkify', () => {
  it('splits out a link and leaves trailing punctuation as text', () => {
    expect(linkify('see https://a.com/x. ok')).toEqual([
      { text: 'see ' },
      { text: 'https://a.com/x', href: 'https://a.com/x' },
      { text: '. ok' },
    ])
  })
  it('returns plain text untouched', () => {
    expect(linkify('hello')).toEqual([{ text: 'hello' }])
  })
})
