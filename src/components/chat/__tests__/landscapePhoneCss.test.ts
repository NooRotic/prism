import indexCss from '../../../index.css?raw'
import { LANDSCAPE_PHONE_QUERY } from '../landscapePhone'

// jsdom cannot evaluate a media query, so this pins the CSS source: the media block must
// carry exactly the query the hook asks matchMedia for, or the layout and the rail would
// disagree about when the phone is sideways.
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

describe('the landscape-phone rules in index.css', () => {
  const block = blockFor(LANDSCAPE_PHONE_QUERY)

  it('has a media block with LANDSCAPE_PHONE_QUERY verbatim', () => {
    expect(block).toBeDefined()
  })

  it('hides .landscape-phone-hide in that block', () => {
    expect(block).toMatch(/\.landscape-phone-hide\s*\{[^}]*display:\s*none\s*!important/)
  })

  it('zeroes both rail reserve variables with !important in that block', () => {
    expect(block).toMatch(/--rail-reserve-left:\s*0px\s*!important/)
    expect(block).toMatch(/--rail-reserve-right:\s*0px\s*!important/)
  })
})
