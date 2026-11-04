import indexCss from '../../../index.css?raw'

// jsdom cannot evaluate a media query, so this pins the one thing that has to
// hold: the width at which `fill-hide` starts hiding the page chrome must be the
// same width at which Tailwind's `md:` classes (the fill layout and the chat
// header with the fill toggle) switch on. Tailwind compiles `md:` to 48rem, and
// rem in a media query follows the browser's default font size. A hard-coded
// 768px agrees only at the 16px default; at Chrome's "Large" font size `md:` starts
// at 960px, and in 768-959px the chrome is hidden with no fill toggle to leave by.
describe('the fill-hide breakpoint in index.css', () => {
  const condition = /@media\s*([^{]+?)\s*\{\s*:root\[data-fill='md'\]\s+\.fill-hide/.exec(indexCss)?.[1]

  // Without this, an empty import (Vitest blanks stylesheets unless vite.config.ts
  // lets this one through) would make every test below fail for the wrong reason.
  it('can read the stylesheet source', () => {
    expect(indexCss).toContain('.fill-hide')
  })

  it('has a media query around the md-scoped hide rule', () => {
    expect(condition).toBeDefined()
  })

  it("uses Tailwind's md breakpoint, so it moves with the md: classes", () => {
    expect(condition).toContain('theme(--breakpoint-md)')
  })

  it('does not hard-code a pixel width', () => {
    expect(condition).not.toMatch(/\d\s*px/)
  })
})
