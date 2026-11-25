import html from '../../../index.html?raw'
import indexCss from '../../index.css?raw'

// Visit counting (Matomo on stats.pollardjr.com, site 4). The block lives in index.html. It must count only prism.nooroticx.tv,
// set no cookies, and stay silent (no request at all) for a visitor who sends Do Not Track or Global Privacy Control.
// The block is run with stand-ins for the browser's window, document, location and navigator, passed in as the names it uses.

type Visitor = { hostname: string; gpc?: boolean; dnt?: string }

function run({ hostname, gpc, dnt }: Visitor) {
  const m = html.match(/<!-- Matomo -->\s*<script>([\s\S]*?)<\/script>\s*<!-- End Matomo -->/)
  if (!m) throw new Error('the Matomo block is not in index.html')
  const inserted: { src?: string }[] = []
  const classes = new Set<string>()
  const win: { _paq?: unknown[] } = {}
  const first = { parentNode: { insertBefore: (el: { src?: string }) => inserted.push(el) } }
  const doc = {
    documentElement: { classList: { add: (c: string) => classes.add(c) } },
    createElement: () => ({}),
    getElementsByTagName: () => [first],
  }
  new Function('window', 'document', 'location', 'navigator', m[1])(
    win,
    doc,
    { hostname },
    { globalPrivacyControl: gpc, doNotTrack: dnt },
  )
  return {
    paq: win._paq ? (JSON.parse(JSON.stringify(win._paq)) as unknown[][]) : undefined,
    scripts: inserted.map((s) => s.src),
    counted: classes.has('counted'),
  }
}

describe('visit counting block in index.html', () => {
  it('is in the page once', () => {
    expect(html.match(/<!-- Matomo -->/g)).toHaveLength(1)
  })

  it('counts prism.nooroticx.tv: no cookies, site 4, the tracker script from stats.pollardjr.com', () => {
    const r = run({ hostname: 'prism.nooroticx.tv' })
    expect(r.paq).toContainEqual(['disableCookies'])
    expect(r.paq).toContainEqual(['setDoNotTrack', true])
    expect(r.paq).toContainEqual(['setSiteId', '4'])
    expect(r.paq).toContainEqual(['setTrackerUrl', 'https://stats.pollardjr.com/matomo.php'])
    expect(r.paq).toContainEqual(['trackPageView'])
    expect(r.scripts).toEqual(['https://stats.pollardjr.com/matomo.js'])
    expect(r.counted).toBe(true)
  })

  it.each([
    ['localhost', { hostname: 'localhost' }],
    ['the dev server', { hostname: '127.0.0.1' }],
    ['another of the owner’s sites', { hostname: 'portfolio.pollardjr.com' }],
    ['a look-alike address', { hostname: 'prism.nooroticx.tv.example.test' }],
    ['a name that is also an object property', { hostname: 'constructor' }],
    ['Global Privacy Control', { hostname: 'prism.nooroticx.tv', gpc: true }],
    ['Do Not Track "1"', { hostname: 'prism.nooroticx.tv', dnt: '1' }],
    ['Do Not Track "yes"', { hostname: 'prism.nooroticx.tv', dnt: 'yes' }],
  ])('does nothing for %s: no queue, no script, no note', (_name, visitor) => {
    const r = run(visitor)
    expect(r.paq).toBeUndefined()
    expect(r.scripts).toEqual([])
    expect(r.counted).toBe(false)
  })

  it('leaves the address fragment out, before anything is counted (it can hold a sign-in token or an /import list)', () => {
    const names = run({ hostname: 'prism.nooroticx.tv' }).paq!.map(([name, value]) => (name === 'discardHashTag' ? `${name}:${value}` : name))
    expect(names).toContain('discardHashTag:true')
    expect(names.indexOf('discardHashTag:true')).toBeLessThan(names.indexOf('trackPageView'))
  })

  it('hides the "what is counted" note unless the page is counting', () => {
    expect(indexCss).toMatch(/\.counted-note\s*\{[^}]*display:\s*none/)
    expect(indexCss).toMatch(/html\.counted\s+\.counted-note\s*\{[^}]*display:\s*block/)
  })
})
