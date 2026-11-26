// Google's player element brings its own overlay (title, progress, spinner, logo). PRISM draws all of that itself, so the
// overlay is faded out. It is not taken out of the page: the element is what makes the device send the remote's keys.
const STYLE = `
  .background, .logo, .spinner, .splash, .slideshow, tv-overlay, tv-overlay-placeholder { opacity: 0 !important; }
`
const TRY_MS = 250
const TRIES = 80

export function quietCast(): void {
  const attempt = (left: number) => {
    const root = document.querySelector('cast-media-player')?.shadowRoot
    if (root) {
      const style = document.createElement('style')
      style.textContent = STYLE
      root.append(style)
    } else if (left > 0) {
      setTimeout(() => attempt(left - 1), TRY_MS)
    }
  }
  attempt(TRIES)
}
