import indexCss from '../../../index.css?raw'

// jsdom cannot evaluate a media query, so this pins the CSS source. The rail is hidden below
// Tailwind's md breakpoint, so it must use the theme breakpoint (rem-based, like the md: classes
// that make the stacked layout) and not a hard-coded pixel width: the two would disagree as soon
// as the browser's default font size changes, as in fillHideCss.test.ts.
const QUERY = '(width < theme(--breakpoint-md))'

function blockFor(query: string): string | undefined {
  const start = indexCss.indexOf(`@media ${query}`)
  if (start === -1) return undefined
  const open = indexCss.indexOf('{', start)
  let depth = 0
  for (let i = open; i < indexCss.length; i++) {
    if (indexCss[i] === '{') depth++
    if (indexCss[i] === '}' && --depth === 0) return indexCss.slice(open + 1, i)
  }
  return undefined
}

describe('the narrow-window rail rules in index.css', () => {
  const block = blockFor(QUERY)

  it('has a media block for a width below the md theme breakpoint', () => {
    expect(block).toBeDefined()
  })

  it('does not hard-code a pixel width in that query', () => {
    expect(QUERY).not.toMatch(/\d\s*px/)
    expect(indexCss).not.toMatch(/@media\s*\(width\s*<\s*\d+\s*px\)/)
  })

  it('hides .narrow-hide in that block', () => {
    expect(block).toMatch(/\.narrow-hide\s*\{[^}]*display:\s*none\s*!important/)
  })

  it('zeroes both rail reserve variables with !important in that block', () => {
    expect(block).toMatch(/--rail-reserve-left:\s*0px\s*!important/)
    expect(block).toMatch(/--rail-reserve-right:\s*0px\s*!important/)
  })
})
