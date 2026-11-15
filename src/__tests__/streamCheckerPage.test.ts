import { describe, expect, it } from 'vitest'
import checkerPage from '../../public/stream-checker/index.html?raw'
import serverConfig from '../../server/src/Config.php?raw'

// The checker's user agent links to this page, and an operator who sees the traffic fetches it with a script: so it is a plain
// static file (a single-page-app address would answer HTTP 404 with a redirect stub), with its text in the page itself.
const page = () => checkerPage

describe('the stream checker page', () => {
  it('is a complete, self-contained HTML document', () => {
    const html = page()

    expect(html.trimStart().toLowerCase().startsWith('<!doctype html>')).toBe(true)
    expect(html).toMatch(/<html[^>]*\blang="en"/i)
    expect(html).toMatch(/<meta\s+charset="utf-8"/i)
    expect(html).toMatch(/<meta\s+name="viewport"\s+content="[^"]*width=device-width/i)
    expect(html).not.toMatch(/<script\b/i)
    expect(html).not.toMatch(/<link[^>]+href="https?:/i)
    expect(html).not.toMatch(/src="https?:/i)
  })

  it('has a title of two to four words', () => {
    const title = /<title>([^<]+)<\/title>/i.exec(page())?.[1] ?? ''

    expect(title.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2)
    expect(title.trim().split(/\s+/).length).toBeLessThanOrEqual(4)
  })

  it('says who is calling, what it does and what it keeps', () => {
    const text = page()

    expect(text).toContain('PRISM-StreamChecker')
    expect(text).toContain('once a day')
    expect(text).toContain('one request a second')
    expect(text).toContain('https://prism.nooroticx.tv')
    expect(text).toContain('stores only pass or fail')
    expect(text).toContain('Origin')
  })

  it('does not promise more than the checker does: about once a day (more often for a few days after a failure), and a redirect can add a request', () => {
    const text = page()

    expect(text).toContain('about once a day')
    expect(text).toMatch(/more often/i)
    expect(text).toContain('a redirect can add a request')
  })

  it('tells a stream owner how to ask for removal, through the repository issues, with no email address', () => {
    const html = page()

    expect(html).toContain('href="https://github.com/NooRotic/prism/issues/new"')
    expect(html).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) // no email address (the CSS has an @media rule, so a bare "@" is fine)
    expect(html).not.toMatch(/mailto:/i)
  })

  it('follows the reader to a dark theme and sets its own background', () => {
    const html = page()

    expect(html).toMatch(/prefers-color-scheme:\s*dark/)
    expect(html).toMatch(/body\s*\{[^}]*background/)
  })

  it('is the address the server\'s default user agent points at', () => {
    expect(serverConfig).toContain('PRISM-StreamChecker/1.0 (+https://prism.nooroticx.tv/stream-checker/)')
    // public/stream-checker/index.html is served at /stream-checker/ on GitHub Pages
    expect(page().length).toBeGreaterThan(500)
  })
})
