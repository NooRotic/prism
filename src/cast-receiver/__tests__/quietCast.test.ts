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
  expect(getComputedStyle(root.querySelector('tv-overlay') as Element).opacity).toBe('0')
  expect(getComputedStyle(root.querySelector('.spinner') as Element).opacity).toBe('0')
  expect(getComputedStyle(root.querySelector('video') as Element).opacity).not.toBe('0')
  // Faded, not taken out: the element is what makes the device send keys.
  expect(getComputedStyle(root.querySelector('tv-overlay') as Element).display).not.toBe('none')
})

it('gives up quietly when there is no such element', () => {
  vi.useFakeTimers()
  quietCast()
  vi.advanceTimersByTime(60_000)
  expect(vi.getTimerCount()).toBe(0)
})
