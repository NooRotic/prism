import { quietCast } from '../quietCast'

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

it('fades Google’s own overlay out and leaves the picture, once, whenever its element is ready', () => {
  vi.useFakeTimers()
  const host = document.createElement('cast-media-player')
  document.body.append(host)
  quietCast()
  vi.advanceTimersByTime(1000)
  const root = host.attachShadow({ mode: 'open' })
  root.innerHTML = '<video></video><tv-overlay></tv-overlay><div class="spinner"></div>'
  vi.advanceTimersByTime(5000)
  expect(root.querySelectorAll('style')).toHaveLength(1)
  // jsdom applies nothing in a shadow root, so the rule's own text is read. That it fades them was seen in a real browser.
  const [, selector, body] = /^\s*([^{]+)\{([^}]+)\}\s*$/.exec(root.querySelector('style')?.textContent ?? '') ?? []
  expect(body.trim()).toBe('opacity: 0 !important;')
  expect(root.querySelector('tv-overlay')?.matches(selector)).toBe(true)
  expect(root.querySelector('.spinner')?.matches(selector)).toBe(true)
  expect(root.querySelector('video')?.matches(selector)).toBe(false)
})

it('gives up quietly when there is no such element', () => {
  vi.useFakeTimers()
  quietCast()
  vi.advanceTimersByTime(60_000)
  expect(vi.getTimerCount()).toBe(0)
})
