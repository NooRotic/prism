// The PRISM mark: a wireframe triangular prism that extrudes and sways while a beam (the URL) routes into three rays, one per
// platform colour: Twitch purple, the fallback-engine green, YouTube red. It draws the app's multi-engine fallback chain as light:
// the Twitch ray fails (RGB glitch), the beam reroutes to the fallback engine, then a YouTube URL routes straight through.
//
// `render(t)` is a pure function of time in seconds, so the mark can be driven by requestAnimationFrame, scrubbed or captured.
// Seconds 0..INTRO_SECONDS are the intro (extrude, draw-on, wordmark); after that a LOOP_SECONDS routing loop repeats.
// Flat strokes only (no gradients, no glow). Colours are the app's tokens: --accent-twitch, --accent-green, YouTube red.

const NS = 'http://www.w3.org/2000/svg'
const PURPLE = '#9146ff'
const GREEN = '#39ff14'
const RED = '#ff0000'
const INK = '#fefefe'
const GROUND = '#050507'

export const LOOP_SECONDS = 12
export const INTRO_SECONDS = 3.6

type Ray = 'p' | 'g' | 'r'
type Keys = ReadonlyArray<readonly [number, number]>
type Vec = number[]
type Pt = readonly [number, number, number]

const RAYS: readonly Ray[] = ['p', 'g', 'r']

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3)
const easeInOut = (t: number) => {
  const c = clamp(t)
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2
}
const easeBack = (t: number) => {
  const c = clamp(t)
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2)
}
const hex = (h: string): Vec => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const rgb = (a: Vec) => `rgb(${a.map((v) => Math.round(v)).join(',')})`
const mix = (a: Vec, b: Vec, t: number): Vec => a.map((v, i) => v + (b[i] - v) * t)
/** Keyframed value at time `u`, easing smoothly between neighbouring keys. */
const keyed = (keys: Keys, u: number): number => {
  if (u <= keys[0][0]) return keys[0][1]
  for (let i = 0; i < keys.length - 1; i++) {
    if (u < keys[i + 1][0]) return keys[i][1] + (keys[i + 1][1] - keys[i][1]) * smooth(keys[i][0], keys[i + 1][0], u)
  }
  return keys[keys.length - 1][1]
}
const round1 = (x: number) => String(Math.round(x * 10) / 10)
/** A number for an SVG attribute, to 3 decimals, so the DOM carries 0.71 and not 0.7100000000000003. */
const n3 = (x: number) => String(Math.round(x * 1000) / 1000)

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag)
  for (const k of Object.keys(attrs)) node.setAttribute(k, String(attrs[k]))
  parent?.appendChild(node)
  return node
}

// Routing timeline, in loop seconds. A weight is how strongly the beam (and the wordmark) wears that route's colour.
const WEIGHT: Record<Ray, Keys> = {
  p: [[0, 0], [0.15, 1], [1.2, 1], [1.6, 0], [12, 0]],
  g: [[0, 0], [1.9, 0], [2.1, 1], [3.1, 1], [3.6, 0], [12, 0]],
  r: [[0, 0], [6.0, 0], [6.2, 1], [7.3, 1], [7.8, 0], [12, 0]],
}
const RAY_OPACITY: Record<Ray, Keys> = {
  p: [[0, 0.42], [0.4, 1], [1.3, 1], [1.4, 0.2], [1.5, 1], [1.6, 0.1], [1.7, 0.8], [1.8, 0.12], [4.8, 0.12], [5.6, 0.42], [12, 0.42]],
  g: [[0, 0.42], [1.9, 0.42], [2.1, 1], [3.4, 1], [5.0, 0.42], [12, 0.42]],
  r: [[0, 0.42], [6.0, 0.42], [6.2, 1], [7.9, 1], [9.0, 0.42], [12, 0.42]],
}
/** [start, end, how far along the ray the packet gets]. The Twitch packet dies at 72%: that is the failure. */
const PULSE: Record<Ray, readonly [number, number, number]> = { p: [0.5, 1.15, 0.72], g: [2.0, 2.9, 1.0], r: [6.3, 7.2, 1.0] }
const GLITCH: Keys = [[0, 0], [1.1, 0], [1.15, 0.85], [1.25, 0], [1.35, 0.7], [1.45, 0], [1.55, 0.8], [1.65, 0], [12, 0]]
const FAIL_OPACITY: Keys = [[0, 0], [1.7, 0], [2.0, 1], [4.8, 1], [5.4, 0], [12, 0]]
const FAIL_SCALE: Keys = [[0, 0.3], [1.7, 0.3], [2.0, 1.15], [2.2, 1], [12, 1]]
const OK_WINDOW: Record<'g' | 'r', readonly [number, number]> = { g: [2.9, 5.0], r: [7.2, 9.0] }

const okOpacity = (k: 'g' | 'r', u: number) => {
  const [a, b] = OK_WINDOW[k]
  return keyed([[0, 0], [a, 0], [a + 0.2, 1], [b, 1], [b + 0.6, 0], [12, 0]], u)
}
const okScale = (k: 'g' | 'r', u: number) => {
  const [a] = OK_WINDOW[k]
  return keyed([[0, 0.3], [a, 0.3], [a + 0.2, 1.3], [a + 0.45, 1], [12, 1]], u)
}
const pulseAt = (k: Ray, u: number) => {
  const [t0, t1, end] = PULSE[k]
  const off = u < t0 ? 0.14 : u >= t1 ? -end : 0.14 + (-end - 0.14) * easeInOut((u - t0) / (t1 - t0))
  return { off, op: u >= t0 && u < t1 + 0.05 ? 1 : 0 }
}
/** The colour `base` takes at loop time `u`, as the routing timeline tints it. */
const routed = (base: Vec, u: number): Vec => {
  let c = base
  c = mix(c, hex(PURPLE), keyed(WEIGHT.p, u))
  c = mix(c, hex(GREEN), keyed(WEIGHT.g, u))
  c = mix(c, hex(RED), keyed(WEIGHT.r, u))
  return c
}
const strongest = (u: number) => Math.max(keyed(WEIGHT.p, u), keyed(WEIGHT.g, u), keyed(WEIGHT.r, u))

// Geometry, in a 980 x 600 view box. The prism is centred on (400, 400); the triangle is 300 px wide.
const TRI: ReadonlyArray<readonly [number, number]> = [[0, -130], [-150, 130], [150, 130]]
const HALF_DEPTH = 95
const CX = 400
const CY = 400
const FOCAL = 1400
const SOURCE: readonly [number, number] = [60, 468]
const ENDS: Record<Ray, readonly [number, number]> = { p: [740, 325], g: [740, 436], r: [740, 547] }
const LABELS: Record<Ray, string> = { p: 'TWITCH', g: 'HLS · DASH · MP4', r: 'YOUTUBE' }
const COLOURS: Record<Ray, string> = { p: PURPLE, g: GREEN, r: RED }
const YAW = -0.5
const YAW_SWAY = 0.22
const PITCH = -0.16
const PITCH_SWAY = 0.06
const EDGES: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]]

// The wordmark: monoline letters built from straight strokes with chamfered corners (squared, techy, nothing rounded), one
// path per stroke so each draws on cleanly, 150 high. Butt caps and mitered joins keep the ends and corners sharp.
const LETTERS: ReadonlyArray<readonly [string, number]> = [
  ['M7 150V7H58L82 31V57L58 81H7', 92],
  ['M7 150V7H58L82 31V57L58 81H7 M46 81L90 150', 100],
  ['M35 7V143 M10 7H60 M10 143H60', 70],
  ['M84 7H24L8 23V55L24 71H66L82 87V127L66 143H6', 92],
  ['M7 150V7L52 92L97 7V150', 104],
]
const LETTER_GAP = 26

interface Word {
  group: SVGGElement
  letters: SVGPathElement[][]
  ghost: boolean
}

export interface PrismMarkOptions {
  /** `hero` is the landing mark (with labels and nodes); `icon` is the static header pose. */
  mode?: 'hero' | 'icon'
  /** Draw the PRISM wordmark under the prism (hero only). */
  wordmark?: boolean
}

export interface PrismMarkInstance {
  svg: SVGSVGElement
  /** Draw the mark at time `t` seconds. `hover` (0..1) drives the icon's pulse. */
  render: (t: number, hover?: number) => void
}

export function mountPrismMark(host: Element, options: PrismMarkOptions = {}): PrismMarkInstance {
  const icon = options.mode === 'icon'
  const withWordmark = !icon && options.wordmark !== false
  const thick = icon ? 1.9 : 1 // strokes scale up so the mark holds at header size
  const svg = el('svg', {
    viewBox: icon ? '40 240 640 320' : withWordmark ? '20 190 980 600' : '20 190 980 460',
    'aria-hidden': 'true',
    focusable: 'false',
    width: '100%',
    height: '100%',
  })
  svg.style.overflow = icon ? 'hidden' : 'visible'
  svg.style.display = 'block'
  host.appendChild(svg)

  const faceFront = el('polygon', { fill: INK, 'fill-opacity': 0.05 }, svg)
  const faceLeft = el('polygon', { fill: INK, 'fill-opacity': 0.03 }, svg)
  const faceRight = el('polygon', { fill: INK, 'fill-opacity': 0.06 }, svg)
  const edges = EDGES.map(() => el('path', { fill: 'none', stroke: INK, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, svg))
  const beam = el('path', { fill: 'none', 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, svg)
  const inner = el('path', { fill: 'none', 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1', opacity: 0.75 }, svg)

  const rays = {} as Record<Ray, SVGPathElement>
  const pulses = {} as Record<Ray, SVGPathElement>
  const nodes = {} as Record<Ray, SVGCircleElement>
  const labels = {} as Record<Ray, SVGTextElement>
  const oks = {} as Record<'g' | 'r', SVGCircleElement>
  const ghosts: SVGPathElement[] = []
  let failMark: SVGPathElement | undefined
  for (const k of RAYS) {
    const [ex, ey] = ENDS[k]
    rays[k] = el('path', { fill: 'none', stroke: COLOURS[k], 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '1 1' }, svg)
    if (k === 'p') for (const c of [GREEN, RED]) ghosts.push(el('path', { fill: 'none', stroke: c, 'stroke-linecap': 'round', opacity: 0 }, svg))
    pulses[k] = el('path', { fill: 'none', stroke: INK, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': '.14 1', opacity: 0 }, svg)
    if (icon) continue
    nodes[k] = el('circle', { cx: ex, cy: ey, r: 12, fill: GROUND, stroke: COLOURS[k], 'stroke-width': 5 }, svg)
    if (k === 'p') {
      failMark = el('path', { d: `M${ex - 9} ${ey - 9}L${ex + 9} ${ey + 9}M${ex + 9} ${ey - 9}L${ex - 9} ${ey + 9}`, stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round', fill: 'none', opacity: 0 }, svg)
    } else {
      oks[k] = el('circle', { cx: ex, cy: ey, r: 18, fill: COLOURS[k], opacity: 0 }, svg)
    }
    labels[k] = el('text', { x: ex + 30, y: ey + 8, fill: '#7b8090', 'font-family': 'var(--font-mono, ui-monospace, monospace)', 'font-size': 22, 'font-weight': 600, 'letter-spacing': 3 }, svg)
    labels[k].textContent = LABELS[k]
  }

  // Wordmark in three layers: the main letters and two RGB-split ghosts that only flicker during the Twitch failure.
  const words: Word[] = []
  if (withWordmark) {
    const total = LETTERS.reduce((a, l) => a + l[1], 0) + LETTER_GAP * (LETTERS.length - 1)
    const scale = 0.95
    const x0 = 500 - (total * scale) / 2
    const layers: Array<[string | null, number, number]> = [[null, 0, 0], [GREEN, -6, 3], [RED, 6, -3]]
    for (const [ghostColour, dx, dy] of layers) {
      const group = el('g', { transform: `translate(${x0 + dx} ${620 + dy}) scale(${scale})` }, svg)
      let x = 0
      const letters = LETTERS.map(([d, w]) => {
        const strokes = d.split(' M').map((part, j) => {
          const p = el('path', { d: (j ? 'M' : '') + part, transform: `translate(${x} 0)`, fill: 'none', 'stroke-width': 14, 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-miterlimit': 3, pathLength: 1, 'stroke-dasharray': '1 1' }, group)
          if (ghostColour) {
            p.setAttribute('stroke', ghostColour)
            p.setAttribute('opacity', '0')
          }
          return p
        })
        x += w + LETTER_GAP
        return strokes
      })
      words.push({ group, letters, ghost: ghostColour !== null })
    }
  }

  const render = (t: number, hover = 0) => {
    const u = icon || t < INTRO_SECONDS ? 0 : (t - INTRO_SECONDS) % LOOP_SECONDS
    const sway = Math.sin((2 * Math.PI * u) / LOOP_SECONDS)

    // Pose: sway on the loop clock; during the intro the prism extrudes from a flat triangle and turns into view.
    let yaw = YAW + YAW_SWAY * sway + (icon ? 0.1 * Math.sin(Math.PI * hover) : 0)
    let pitch = PITCH + PITCH_SWAY * Math.sin((2 * Math.PI * u) / LOOP_SECONDS + 1)
    let depth = 1
    if (!icon && t < INTRO_SECONDS) {
      depth = t < 0.75 ? 0 : easeBack((t - 0.75) / 0.8)
      const turn = easeInOut((t - 0.75) / 1.0)
      yaw *= turn
      pitch *= turn
    }
    const h = HALF_DEPTH * depth
    const cy = Math.cos(yaw)
    const sy = Math.sin(yaw)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    const project = (x: number, y: number, z: number): Pt => {
      const x1 = x * cy + z * sy
      const z1 = -x * sy + z * cy
      const y2 = y * cp - z1 * sp
      const z2 = y * sp + z1 * cp
      const s = FOCAL / (FOCAL - z2)
      return [CX + x1 * s, CY + y2 * s, z2]
    }
    const V = TRI.map(([x, y]) => project(x, y, h)).concat(TRI.map(([x, y]) => project(x, y, -h)))
    const along = (a: readonly [number, number], b: readonly [number, number], k: number): [number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
    const entry = along(TRI[0], TRI[1], 0.55)
    const exit = along(TRI[0], TRI[2], 0.6)
    const PE = project(entry[0], entry[1], 0)
    const E = project(exit[0], exit[1], 0)
    const pt = (p: Pt) => `${round1(p[0])} ${round1(p[1])}`

    const weight = strongest(u)
    const beamColour = rgb(routed(hex(INK), u))
    const beamWidth = (7 + 4 * weight) * thick

    faceFront.setAttribute('points', [V[0], V[1], V[2]].map(pt).join(' '))
    faceLeft.setAttribute('points', [V[0], V[1], V[4], V[3]].map(pt).join(' '))
    faceRight.setAttribute('points', [V[0], V[2], V[5], V[3]].map(pt).join(' '))
    faceFront.setAttribute('fill-opacity', n3(0.05 * smooth(0.3, 0.9, t)))
    faceLeft.setAttribute('fill-opacity', n3(0.03 * depth))
    faceRight.setAttribute('fill-opacity', n3((0.06 + 0.2 * weight) * depth))
    faceRight.setAttribute('fill', beamColour) // the exit face takes the colour of the active route

    EDGES.forEach(([a, b], i) => {
      const front = i < 3
      const drawn = icon || t >= 1.2 ? 1 : front ? easeOut((t - i * 0.25) / 0.4) : 1
      let op = 0.35 + 0.65 * smooth(-150, 150, (V[a][2] + V[b][2]) / 2) // nearer edges read brighter
      if (!front) op *= i < 6 ? smooth(0, 1, depth) : smooth(0.02, 0.5, depth)
      edges[i].setAttribute('d', `M${pt(V[a])}L${pt(V[b])}`)
      edges[i].setAttribute('stroke-width', n3((front ? 6 : 4.5) * thick))
      edges[i].setAttribute('opacity', drawn > 0.001 ? n3(Math.round(op * 100) / 100) : '0')
      edges[i].setAttribute('stroke-dashoffset', n3(1 - drawn))
    })

    const beamDrawn = icon ? 1 : easeOut((t - 1.6) / 0.5)
    const innerDrawn = icon ? 1 : clamp((t - 2.05) / 0.25)
    beam.setAttribute('d', `M${SOURCE[0]} ${SOURCE[1]}L${pt(PE)}`)
    beam.setAttribute('stroke', beamColour)
    beam.setAttribute('stroke-width', n3(beamWidth))
    beam.setAttribute('stroke-dashoffset', n3(1 - beamDrawn))
    beam.setAttribute('opacity', beamDrawn > 0.001 ? '1' : '0')
    inner.setAttribute('d', `M${pt(PE)}L${pt(E)}`)
    inner.setAttribute('stroke', beamColour)
    inner.setAttribute('stroke-width', n3(beamWidth * 0.72))
    inner.setAttribute('stroke-dashoffset', n3(1 - innerDrawn))
    inner.setAttribute('opacity', innerDrawn > 0.001 ? '0.75' : '0')

    RAYS.forEach((k, i) => {
      const d = `M${pt(E)}L${ENDS[k][0]} ${ENDS[k][1]}`
      const drawn = icon ? 1 : easeOut((t - (2.2 + i * 0.08)) / 0.5)
      rays[k].setAttribute('d', d)
      rays[k].setAttribute('stroke-width', n3(6 * thick))
      rays[k].setAttribute('stroke-dashoffset', n3(1 - drawn))
      rays[k].setAttribute('opacity', drawn > 0.001 ? n3(icon ? 0.95 : keyed(RAY_OPACITY[k], u)) : '0')
      let pulse = pulseAt(k, u)
      if (icon && hover > 0 && hover < 1) pulse = { off: 0.14 - 1.14 * easeInOut(hover), op: 1 }
      pulses[k].setAttribute('d', d)
      pulses[k].setAttribute('stroke-width', n3(8 * thick))
      pulses[k].setAttribute('stroke-dashoffset', n3(pulse.off))
      pulses[k].setAttribute('opacity', n3(pulse.op))
      if (!icon) {
        const [cx, cyy] = ENDS[k]
        const about = (s: number) => `translate(${cx} ${cyy}) scale(${s}) translate(${-cx} ${-cyy})`
        const pop = easeBack((t - (2.65 + i * 0.08)) / 0.35)
        nodes[k].setAttribute('transform', about(Math.max(pop, 0.001)))
        nodes[k].setAttribute('opacity', n3(0.55 * clamp(pop * 3)))
        labels[k].setAttribute('opacity', n3(smooth(3.0, 3.4, t)))
        if (k !== 'p') {
          oks[k].setAttribute('opacity', n3(okOpacity(k, u)))
          oks[k].setAttribute('transform', about(okScale(k, u)))
        }
      }
      if (k === 'p') {
        const flicker = keyed(GLITCH, u)
        ghosts[0].setAttribute('d', d)
        ghosts[0].setAttribute('transform', 'translate(-7 4)')
        ghosts[1].setAttribute('d', d)
        ghosts[1].setAttribute('transform', 'translate(7 -4)')
        for (const g of ghosts) {
          g.setAttribute('opacity', n3(flicker))
          g.setAttribute('stroke-width', n3(5 * thick))
        }
      }
    })
    if (failMark) {
      const [cx, cyy] = ENDS.p
      failMark.setAttribute('opacity', n3(keyed(FAIL_OPACITY, u)))
      failMark.setAttribute('transform', `translate(${cx} ${cyy}) scale(${keyed(FAIL_SCALE, u)}) translate(${-cx} ${-cyy})`)
    }

    // Wordmark: draws on in beam-white, settles to PRISM green, then wears the route's colour in a left-to-right wave.
    const flicker = keyed(GLITCH, u)
    for (const word of words) {
      word.letters.forEach((strokes, i) => {
        const start = 1.3 + i * 0.28
        const drawn = easeInOut((t - start) / 0.8)
        const base = mix(hex(INK), hex(GREEN), smooth(start + 0.8, start + 1.3, t))
        const uLetter = (((u - i * 0.09) % LOOP_SECONDS) + LOOP_SECONDS) % LOOP_SECONDS
        strokes.forEach((p, j) => {
          const part = clamp(drawn * strokes.length - j)
          p.setAttribute('stroke-dashoffset', n3(1 - part))
          if (word.ghost) {
            p.setAttribute('opacity', n3(flicker))
            return
          }
          p.setAttribute('opacity', part > 0.001 ? '1' : '0')
          p.setAttribute('stroke', rgb(routed(base, t < INTRO_SECONDS ? 0 : uLetter)))
        })
      })
    }
  }

  return { svg, render }
}
