import { INTRO_SECONDS, LOOP_SECONDS, mountPrismMark } from '../prismMark'

function host() {
  const node = document.createElement('div')
  document.body.appendChild(node)
  return node
}

describe('mountPrismMark', () => {
  it('draws a decorative svg into the host', () => {
    const node = host()
    const mark = mountPrismMark(node)
    expect(node.querySelector('svg')).toBe(mark.svg)
    expect(mark.svg.getAttribute('aria-hidden')).toBe('true')
    node.remove()
  })

  it('is a pure function of time: the loop repeats exactly after LOOP_SECONDS', () => {
    const node = host()
    const mark = mountPrismMark(node)
    mark.render(INTRO_SECONDS + 4.2)
    const settle = (html: string) => html.replace(/-?\d+\.\d+/g, (m) => (+m).toFixed(2)) // modulo arithmetic differs in the last bits
    const first = settle(mark.svg.outerHTML)
    mark.render(INTRO_SECONDS + 4.2 + LOOP_SECONDS)
    expect(settle(mark.svg.outerHTML)).toBe(first)
    node.remove()
  })

  it('starts empty and ends drawn: the beam, rays and wordmark are hidden at t=0 and visible after the intro', () => {
    const node = host()
    const mark = mountPrismMark(node)
    mark.render(0)
    const rays = () => [...mark.svg.querySelectorAll('path[stroke="#9146ff"], path[stroke="#39ff14"], path[stroke="#ff0000"]')]
    expect(rays().some((p) => p.getAttribute('opacity') !== '0' && p.getAttribute('stroke-dasharray') === '1 1')).toBe(false)
    mark.render(INTRO_SECONDS)
    expect(rays().some((p) => p.getAttribute('stroke-dasharray') === '1 1' && Number(p.getAttribute('opacity')) > 0)).toBe(true)
    node.remove()
  })

  it('the Twitch route fails and the fallback takes over: the failure mark shows, then the fallback ring pops', () => {
    const node = host()
    const mark = mountPrismMark(node)
    const circles = () => [...mark.svg.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '18')
    mark.render(INTRO_SECONDS + 1.0) // Twitch packet is still on its way
    expect(circles().every((c) => c.getAttribute('opacity') === '0')).toBe(true)
    mark.render(INTRO_SECONDS + 3.5) // the green fallback has arrived
    expect(circles().some((c) => Number(c.getAttribute('opacity')) > 0.9)).toBe(true)
    node.remove()
  })

  it('icon mode has no labels, nodes or wordmark, and pulses on hover', () => {
    const node = host()
    const mark = mountPrismMark(node, { mode: 'icon' })
    mark.render(0, 0)
    expect(mark.svg.querySelector('text')).toBeNull()
    expect(mark.svg.querySelectorAll('circle')).toHaveLength(0)
    const pulseOpacity = () => [...mark.svg.querySelectorAll('path[stroke-dasharray=".14 1"]')].map((p) => p.getAttribute('opacity'))
    expect(pulseOpacity().every((o) => o === '0')).toBe(true)
    mark.render(0, 0.5)
    expect(pulseOpacity().every((o) => o === '1')).toBe(true)
    node.remove()
  })
})
