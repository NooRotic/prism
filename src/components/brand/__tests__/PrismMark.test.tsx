import { render } from '@testing-library/react'
import { PrismMark } from '../PrismMark'

describe('PrismMark', () => {
  it('mounts a decorative svg and removes it on unmount', () => {
    const { container, unmount } = render(<PrismMark variant="icon" hover />)
    expect(container.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument()
    unmount()
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeNull()
  })

  it('the hero renders a single static final frame for a visitor who prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('prefers-reduced-motion'), media: query }))
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    const { container } = render(<PrismMark variant="hero" />)
    expect(raf).not.toHaveBeenCalled()
    // the wordmark's letters are all drawn (stroke-dashoffset 0)
    const letters = [...container.querySelectorAll('path[stroke-width="14"][opacity="1"]')]
    expect(letters.length).toBeGreaterThan(0)
    expect(letters.every((p) => p.getAttribute('stroke-dashoffset') === '0')).toBe(true)
    raf.mockRestore()
    vi.unstubAllGlobals()
  })
})
