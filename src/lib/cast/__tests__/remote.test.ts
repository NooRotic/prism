import type { StreamEntry } from '../../streamsApi'
import type { GuideGroup } from '../surf'
import { REMOTE_START, remote, resolveGuide, type RemoteContext, type RemoteEffect, type RemoteEvent, type RemoteState } from '../remote'

const entry = (id: string): StreamEntry => ({ id, name: id.toUpperCase(), groups: [0], country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: `https://h.test/${id}.m3u8` })
const [A, B, C, N] = ['a', 'b', 'c', 'n'].map(entry)
const GROUPS: GuideGroup[] = [
  { key: 'favorites', label: 'Favorites', streams: [A, B] },
  { key: 'all', label: 'All', streams: [A, B, C] },
]
const ALL_ONLY: GuideGroup[] = [{ key: 'all', label: 'All', streams: [A, B, C] }]
const CTX: RemoteContext = { surf: [A, B, C], groups: GROUPS, playingId: 'b', retry: false }

/** A remote in someone's hand: keeps the state, collects the effects. */
function hand(ctx: RemoteContext = CTX) {
  let state: RemoteState = REMOTE_START
  const effects: RemoteEffect[] = []
  const send = (event: RemoteEvent, now: number, use: RemoteContext = ctx) => {
    const result = remote(state, event, now, use)
    state = result.state
    effects.push(...result.effects)
    return result
  }
  return {
    press: (key: string, now: number, use?: RemoteContext) => send({ type: 'keydown', key }, now, use),
    release: (key: string, now: number) => send({ type: 'keyup', key }, now),
    /** Held from `now` for `ms`: the first repeat after 400 ms, then every 50 (measured on the device). */
    hold: (key: string, now: number, ms: number) => {
      send({ type: 'keydown', key }, now)
      for (let t = 400; t <= ms; t += 50) send({ type: 'keydown', key }, now + t)
    },
    taken: (now: number) => send({ type: 'taken' }, now),
    tick: (now: number, use?: RemoteContext) => send({ type: 'tick' }, now, use),
    get state() {
      return state
    },
    get at() {
      return state.guide && { group: state.guide.group, row: state.guide.row }
    },
    effects,
    of: (type: RemoteEffect['type']) => effects.filter((effect) => effect.type === type),
  }
}

describe('OK', () => {
  it('opens the guide on the playing channel and asks for a fresh list', () => {
    const r = hand()
    expect(r.press('Enter', 0).claimed).toBe(true)
    expect(r.at).toEqual({ group: 0, row: 1 })
    expect(r.of('refreshList')).toHaveLength(1)
  })

  it('opens on the first row of the first group when nothing plays', () => {
    const r = hand({ ...CTX, playingId: null })
    r.press('Enter', 0)
    expect(r.at).toEqual({ group: 0, row: 0 })
  })

  it('counts a held key as one press, however long', () => {
    const r = hand()
    r.hold('Enter', 0, 3000)
    expect(r.state.guide).not.toBeNull()
    expect(r.of('tune')).toHaveLength(0)
    r.press('Enter', 3700)
    expect(r.state.guide).toBeNull()
  })

  it('watches another channel and closes; the playing one just closes', () => {
    const r = hand()
    r.press('Enter', 0)
    r.press('ArrowUp', 1000)
    r.press('Enter', 2000)
    expect(r.of('tune')).toEqual([{ type: 'tune', entry: A }])
    expect(r.state.guide).toBeNull()

    const same = hand()
    same.press('Enter', 0)
    same.press('Enter', 1000)
    expect(same.of('tune')).toHaveLength(0)
    expect(same.state.guide).toBeNull()
  })

  it('tries the playing channel again when it is not working', () => {
    const r = hand({ ...CTX, retry: true })
    r.press('Enter', 0)
    r.press('Enter', 1000)
    expect(r.of('tune')).toEqual([{ type: 'tune', entry: B }])
  })

  it('says there is no list instead of opening an empty guide', () => {
    const r = hand({ surf: [], groups: [], playingId: null, retry: false })
    r.press('Enter', 0)
    expect(r.state.guide).toBeNull()
    expect(r.of('noList')).toHaveLength(1)
    expect(r.of('refreshList')).toHaveLength(1)
  })
})

describe('Up and Down with the guide closed', () => {
  it('shows names while held and tunes only the one it stops on, 600 ms after', () => {
    const r = hand()
    r.press('ArrowDown', 0)
    r.press('ArrowDown', 450)
    r.press('ArrowDown', 500) // under 100 ms after the last step
    r.press('ArrowDown', 550)
    expect(r.of('preview').map((e) => 'entry' in e && e.entry.id)).toEqual(['c', 'a', 'b'])
    r.tick(1149)
    expect(r.of('tune')).toHaveLength(0)
    r.press('ArrowDown', 1149)
    r.tick(1748)
    expect(r.of('tune')).toHaveLength(0)
    r.tick(1749)
    expect(r.of('tune')).toEqual([{ type: 'tune', entry: C }])
    r.tick(5000)
    expect(r.of('tune')).toHaveLength(1)
  })

  it('does not tune again when it stops on what is already playing, even as the only channel', () => {
    const r = hand()
    r.press('ArrowDown', 0)
    r.press('ArrowUp', 200)
    r.tick(900)
    expect(r.of('tune')).toHaveLength(0)
    const only = hand({ ...CTX, surf: [B] })
    only.press('ArrowDown', 0)
    only.tick(700)
    expect(only.of('tune')).toHaveLength(0)
  })

  it('tunes the same channel again when it is not working', () => {
    const r = hand({ ...CTX, surf: [B], retry: true })
    r.press('ArrowDown', 0)
    r.tick(700)
    expect(r.of('tune')).toEqual([{ type: 'tune', entry: B }])
  })

  it('forgets a waiting flip when the guide opens, or when the computer picks a channel', () => {
    const r = hand()
    r.press('ArrowDown', 0)
    r.press('Enter', 200)
    r.tick(5000)
    expect(r.of('tune')).toHaveLength(0)
    const picked = hand()
    picked.press('ArrowDown', 0)
    picked.taken(300)
    picked.tick(5000)
    expect(picked.of('tune')).toHaveLength(0)
  })

  it('says there is no list', () => {
    const r = hand({ surf: [], groups: [], playingId: 'b', retry: false })
    expect(r.press('ArrowUp', 0).claimed).toBe(true)
    expect(r.of('noList')).toHaveLength(1)
  })

  it('keeps working when the clock goes backwards', () => {
    const r = hand()
    r.press('ArrowDown', 10_000)
    r.press('ArrowDown', 100)
    expect(r.of('preview')).toHaveLength(2)
  })
})

describe('moving in the guide', () => {
  it('moves one row per 100 ms and wraps', () => {
    const r = hand({ ...CTX, playingId: 'a' })
    r.press('Enter', 0)
    r.press('ArrowRight', 500) // All: 3 rows, playing A
    expect(r.at).toEqual({ group: 1, row: 0 })
    r.press('ArrowDown', 1000)
    r.press('ArrowDown', 1050)
    r.press('ArrowDown', 1100)
    expect(r.at?.row).toBe(2)
    r.press('ArrowDown', 1300)
    expect(r.at?.row).toBe(0)
    r.press('ArrowUp', 1500)
    expect(r.at?.row).toBe(2)
  })

  it('changes group, wraps, and stands on the playing channel or the first', () => {
    const r = hand({ ...CTX, playingId: 'c' })
    r.press('Enter', 0)
    expect(r.at).toEqual({ group: 1, row: 2 }) // Favorites does not hold C
    expect(r.press('ArrowRight', 500).claimed).toBe(true)
    expect(r.at).toEqual({ group: 0, row: 0 })
    r.press('ArrowLeft', 1000)
    expect(r.at).toEqual({ group: 1, row: 2 })
  })

  it('closes 15 s after the last key', () => {
    const r = hand()
    r.press('Enter', 0)
    r.press('ArrowDown', 1000)
    r.tick(15_999)
    expect(r.state.guide).not.toBeNull()
    r.tick(16_000)
    expect(r.state.guide).toBeNull()
  })
})

describe('a list that changes under an open guide', () => {
  it('keeps the highlighted channel when a group appears in front', () => {
    const r = hand({ ...CTX, groups: ALL_ONLY, playingId: 'c' })
    r.press('Enter', 0)
    expect(r.at).toEqual({ group: 0, row: 2 })
    r.press('Enter', 1000, { ...CTX, playingId: 'x' }) // Favorites came first
    expect(r.of('tune')).toEqual([{ type: 'tune', entry: C }])
  })

  it('keeps the highlighted channel when a row appears above it', () => {
    const r = hand({ ...CTX, groups: ALL_ONLY, playingId: 'c' })
    r.press('Enter', 0)
    r.press('Enter', 1000, { ...CTX, groups: [{ key: 'all', label: 'All', streams: [N, A, B, C] }], playingId: 'x' })
    expect(r.of('tune')).toEqual([{ type: 'tune', entry: C }])
  })

  it('never points outside a list that shrank', () => {
    const r = hand({ ...CTX, playingId: 'c' })
    r.press('Enter', 0)
    r.press('ArrowDown', 500, { surf: [A], groups: [{ key: 'all', label: 'All', streams: [A] }], playingId: null, retry: false })
    expect(r.at).toEqual({ group: 0, row: 0 })
    r.tick(600, { surf: [], groups: [], playingId: null, retry: false })
    expect(r.state.guide).toBeNull()
  })

  it('finds a place by what it was, and the nearest one when that has gone', () => {
    const here = { key: 'all', id: 'c', group: 7, row: 9 }
    expect(resolveGuide(here, GROUPS)).toEqual({ key: 'all', id: 'c', group: 1, row: 2 })
    expect(resolveGuide({ ...here, id: 'gone' }, GROUPS)).toEqual({ key: 'all', id: 'c', group: 1, row: 2 })
    expect(resolveGuide({ ...here, key: 'gone', id: 'gone' }, GROUPS)).toEqual({ key: 'all', id: 'c', group: 1, row: 2 })
    expect(resolveGuide(here, [])).toBeNull()
  })
})

describe('Left and Right with the guide closed', () => {
  it('do nothing, and are kept from Cast, which would seek', () => {
    const r = hand()
    expect(r.press('ArrowLeft', 0).claimed).toBe(true)
    expect(r.press('ArrowRight', 500).claimed).toBe(true)
    expect(r.effects).toHaveLength(0)
    expect(r.state.guide).toBeNull()
  })
})

describe('Back', () => {
  it.each(['BrowserBack', 'GoBack', 'Escape', 'Backspace'])('%s closes the guide and nothing else', (key) => {
    const r = hand()
    r.press('Enter', 0)
    expect(r.press(key, 1000).claimed).toBe(true)
    expect(r.state.guide).toBeNull()
    expect(r.of('backHint')).toHaveLength(0)
  })

  it('asks for a second press, and a held one is not a second', () => {
    const r = hand()
    r.hold('BrowserBack', 0, 2900)
    expect(r.of('backHint')).toHaveLength(1)
    expect(r.of('leave')).toHaveLength(0)
  })

  it('held with the guide open only closes it', () => {
    const r = hand()
    r.press('Enter', 0)
    r.hold('BrowserBack', 1000, 3000)
    expect(r.state.guide).toBeNull()
    expect(r.of('backHint')).toHaveLength(0)
    expect(r.of('leave')).toHaveLength(0)
  })

  it('held through a slow moment of the device is still one press', () => {
    const r = hand()
    for (const t of [0, 400, 450, 500, 750, 800]) r.press('BrowserBack', t) // a 250 ms gap between repeats
    expect(r.of('leave')).toHaveLength(0)
  })

  it('leaves on a second press within 3 s', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    r.press('BrowserBack', 1200)
    expect(r.of('leave')).toHaveLength(1)
  })

  it('lets someone who keeps tapping leave', () => {
    const r = hand()
    for (const t of [0, 500, 1000]) r.press('BrowserBack', t)
    expect(r.of('leave')).toHaveLength(1)
  })

  it('asks again after 3 s', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    r.press('BrowserBack', 3001)
    expect(r.of('leave')).toHaveLength(0)
    expect(r.of('backHint')).toHaveLength(2)
  })

  it('counts two names for one button as one', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    r.press('GoBack', 5)
    expect(r.of('leave')).toHaveLength(0)
    expect(r.of('backHint')).toHaveLength(1)
  })

  it('that closed the guide does not count towards leaving', () => {
    const r = hand()
    r.press('Enter', 0)
    r.press('BrowserBack', 1000)
    r.press('BrowserBack', 2000)
    expect(r.of('leave')).toHaveLength(0)
    expect(r.of('backHint')).toHaveLength(1)
  })

  it('forgets the first press when another button is used', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    r.press('ArrowDown', 700)
    r.press('BrowserBack', 1400)
    expect(r.of('leave')).toHaveLength(0)
  })
})

describe('letting a key up', () => {
  it('is claimed for a key whose press was, so the device does not act on the release', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    expect(r.release('BrowserBack', 80).claimed).toBe(true)
    expect(r.release('BrowserBack', 90).claimed).toBe(false)
    r.press('Enter', 1000)
    r.press('ArrowRight', 1500)
    r.press('BrowserBack', 2000) // the guide has closed
    expect(r.release('ArrowRight', 2100).claimed).toBe(true)
  })

  it('is left alone for a key that was not', () => {
    const r = hand()
    r.press('MediaPlayPause', 0)
    expect(r.release('MediaPlayPause', 80).claimed).toBe(false)
  })

  it('never turns a hold into two presses: a device may send a release with every repeat', () => {
    const back = hand()
    for (const t of [0, 400, 450, 500]) {
      back.press('BrowserBack', t)
      back.release('BrowserBack', t + 1)
    }
    expect(back.of('leave')).toHaveLength(0)
    const ok = hand()
    for (const t of [0, 400, 450, 500]) {
      ok.press('Enter', t)
      ok.release('Enter', t + 45)
    }
    expect(ok.state.guide).not.toBeNull()
  })
})

it.each(['MediaPlayPause', 'a', 'ColorF0Red', 'AudioVolumeUp'])('leaves %s alone', (key) => {
  const r = hand()
  r.press('Enter', 0)
  const before = r.state
  const result = r.press(key, 1000)
  expect(result.claimed).toBe(false)
  expect(r.state).toEqual(before)
})
