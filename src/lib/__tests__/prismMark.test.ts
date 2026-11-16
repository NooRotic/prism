import { INTRO_SECONDS, LOOP_SECONDS, MARK_STORIES, STILL_SECONDS, mountPrismMark, type PrismMarkInstance } from '../prismMark'
import { detectURLType } from '../urlDetection'

function host() {
  const node = document.createElement('div')
  document.body.appendChild(node)
  return node
}

/** Opacity of the text the mark marks with `data-mark`, or null when there is none. */
const opacityOf = (mark: PrismMarkInstance, role: string) => {
  const node = mark.svg.querySelector(`[data-mark="${role}"]`)
  return node ? Number(node.getAttribute('opacity')) : null
}
const textOf = (mark: PrismMarkInstance, role: string) => mark.svg.querySelector(`[data-mark="${role}"]`)?.textContent ?? null
/** The three filled rings that light a ray's node, in ray order: Twitch, HLS / DASH / MP4, YouTube. */
const rings = (mark: PrismMarkInstance) => [...mark.svg.querySelectorAll('circle')].filter((c) => c.getAttribute('r') === '18')

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
    for (const into of [0.4, 2.2, 4.2, 9.6]) { // not 0.1: the last wordmark letter is still settling from the intro then
      mark.render(INTRO_SECONDS + into)
      const settle = (html: string) => html.replace(/-?\d+\.\d+/g, (m) => (+m).toFixed(2)) // modulo arithmetic differs in the last bits
      const first = settle(mark.svg.outerHTML)
      mark.render(INTRO_SECONDS + into + LOOP_SECONDS)
      expect(settle(mark.svg.outerHTML)).toBe(first)
    }
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

  it("reads each address with the app's own detector: Twitch, HLS and YouTube take the purple, green and red rays", () => {
    expect(MARK_STORIES.map((s) => [s.url, s.ray, s.name, s.engine])).toEqual([
      ['twitch.tv/streamer', 'p', 'TWITCH STREAM', 'twitch-sdk'],
      ['example.com/a.m3u8', 'g', 'HLS STREAM', 'videojs'],
      ['youtu.be/a1B2c3D4', 'r', 'YOUTUBE', 'reactplayer'],
    ])
    expect(MARK_STORIES.map((s) => detectURLType(s.url).type)).toEqual(['twitch', 'hls', 'youtube'])
  })

  it('shows each address, then what it was read as, then lights the player it goes to', () => {
    const node = host()
    const mark = mountPrismMark(node)
    for (const story of MARK_STORIES) {
      mark.render(INTRO_SECONDS + story.start + 0.1) // the address has just arrived: not read yet
      expect(textOf(mark, 'address')).toBe(story.url)
      expect(opacityOf(mark, 'address')).toBeGreaterThan(0.1)
      expect(opacityOf(mark, 'reading')).toBe(0)

      mark.render(INTRO_SECONDS + story.start + 2.2) // read, routed, and the player is lit
      expect(opacityOf(mark, 'address')).toBe(1)
      expect(textOf(mark, 'reading')).toBe(story.name)
      expect(opacityOf(mark, 'reading')).toBe(1)
      expect(textOf(mark, `player-${story.ray}`)).toContain(story.engine)
      expect(opacityOf(mark, `player-${story.ray}`)).toBe(1)
    }
    node.remove()
  })

  it('nothing fails over: every address reaches its own player, and each route is one ray with no copies', () => {
    const node = host()
    const mark = mountPrismMark(node)
    const lit = [0, 0, 0]
    for (let u = 0; u < LOOP_SECONDS; u += 0.05) {
      mark.render(INTRO_SECONDS + u)
      rings(mark).forEach((ring, i) => (lit[i] = Math.max(lit[i], Number(ring.getAttribute('opacity')))))
    }
    expect(lit).toEqual([1, 1, 1])
    for (const colour of ['#9146ff', '#39ff14', '#ff0000']) {
      expect(mark.svg.querySelectorAll(`path[stroke="${colour}"]`)).toHaveLength(1)
    }
    node.remove()
  })

  it('rests between addresses, and the still frame for reduced motion is the first address read and routed', () => {
    const node = host()
    const mark = mountPrismMark(node)
    mark.render(INTRO_SECONDS + 0.1)
    expect(opacityOf(mark, 'address')).toBe(0)
    expect(opacityOf(mark, 'reading')).toBe(0)

    mark.render(STILL_SECONDS)
    expect(textOf(mark, 'address')).toBe(MARK_STORIES[0].url)
    expect(opacityOf(mark, 'address')).toBe(1)
    expect(opacityOf(mark, 'reading')).toBe(1)
    expect(Number(rings(mark)[0].getAttribute('opacity'))).toBe(1)
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
