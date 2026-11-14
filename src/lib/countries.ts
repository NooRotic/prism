/**
 * The English name of a country for a flag code (`us` -> "United States"), for the About panel and a flag's tooltip.
 * The upper-case code stands in when the browser has no name for it, and '' when there is no country at all.
 */
export function regionName(code: string | null): string {
  if (!code) return ''
  const upper = code.toUpperCase()
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' })
    const name = names.of(upper)
    // "ZZ" is how the standard spells "unknown", and it gets an answer ("Unknown Region") that is no use to a visitor.
    if (!name || (upper !== 'ZZ' && name === names.of('ZZ'))) return upper
    return upper === 'ZZ' ? upper : name
  } catch {
    return upper
  }
}
