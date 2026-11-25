import type { StreamEntry } from '../../streamsApi'
import type { GuideGroup } from '../surf'
import { REMOTE_START, clampGuide, remote, type RemoteContext, type RemoteEffect, type RemoteState } from '../remote'

const entry = (id: string): StreamEntry => ({ id, name: id.toUpperCase(), groups: [0], country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: `https://h.test/${id}.m3u8` })
const [A, B, C] = ['a', 'b', 'c'].map(entry)
const GROUPS: GuideGroup[] = [
  { key: 'favorites', label: 'Favorites', streams: [A, B] },
  { key: 'all', label: 'All', streams: [A, B, C] },
]
const CTX: RemoteContext = { surf: [A, B, C], groups: GROUPS, playingId: 'b' }

/** A remote in someone's hand: keeps the state, collects the effects. */
function hand(ctx: RemoteContext = CTX) {
  let state: RemoteState = REMOTE_START
  const effects: RemoteEffect[] = []
  const send = (event: Parameters<typeof remote>[1], now: number, use: RemoteContext = ctx) => {
    const result = remote(state, event, now, use)
    state = result.state
    effects.push(...result.effects)
    return result
  }
  return {
    press: (key: string, now: number, use?: RemoteContext) => send({ type: 'keydown', key }, now, use),
    release: (key: string, now: number) => send({ type: 'keyup', key }, now),
    tick: (now: number, use?: RemoteContext) => send({ type: 'tick' }, now, use),
    get state() {
      return state
    },
    effects,
    of: (type: RemoteEffect['type']) => effects.filter((effect) => effect.type === type),
  }
}

describe('OK', () => {
  it('opens the guide on the playing channel and asks for a fresh list', () => {
    const r = hand()
    expect(r.press('Enter', 0).claimed).toBe(true)
    expect(r.state.guide).toEqual({ group: 0, row: 1 })
    expect(r.of('refreshList')).toHaveLength(1)
  })

  it('opens on the first row of the first group holding nothing that plays', () => {
    const r = hand({ ...CTX, playingId: null })
    r.press('Enter', 0)
    expect(r.state.guide).toEqual({ group: 0, row: 0 })
  })

  it('counts a held key as one press, however long', () => {
    const r = hand()
    r.press('Enter', 0)
    r.press('ArrowUp', 100)
    const before = r.state.guide
    r.press('Enter', 1000) // a press of its own: watches A
    expect(r.of('tune')).toHaveLength(1)
    expect(before).toEqual({ group: 0, row: 0 })

    const held = hand()
    held.press('Enter', 0)
    for (let t = 400; t <= 3000; t += 50) held.press('Enter', t)
    expect(held.state.guide).not.toBeNull()
    expect(held.of('tune')).toHaveLength(0)
    held.press('Enter', 3700)
    expect(held.state.guide).toBeNull()
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

  it('says there is no list instead of opening an empty guide', () => {
    const r = hand({ surf: [], groups: [], playingId: null })
    r.press('Enter', 0)
    expect(r.state.guide).toBeNull()
    expect(r.of('noList')).toHaveLength(1)
    expect(r.of('refreshList')).toHaveLength(1)
  })

  it('counts a quick second press once the key was seen to come up', () => {
    const r = hand()
    r.press('Enter', 0)
    r.release('Enter', 100)
    r.press('Enter', 200)
    expect(r.state.guide).toBeNull()
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

  it('does not tune again when it stops on what is already playing', () => {
    const r = hand()
    r.press('ArrowDown', 0)
    r.press('ArrowUp', 200)
    r.tick(900)
    expect(r.of('tune')).toHaveLength(0)
  })

  it('forgets a waiting flip when the guide opens', () => {
    const r = hand()
    r.press('ArrowDown', 0)
    r.press('Enter', 200)
    r.tick(5000)
    expect(r.of('tune')).toHaveLength(0)
  })

  it('tunes again after a failure when the only other place to go is back', () => {
    const r = hand({ ...CTX, surf: [B] })
    r.press('ArrowDown', 0)
    r.tick(700)
    expect(r.of('tune')).toEqual([{ type: 'tune', entry: B }])
  })

  it('says there is no list', () => {
    const r = hand({ surf: [], groups: [], playingId: 'b' })
    expect(r.press('ArrowUp', 0).claimed).toBe(true)
    expect(r.of('noList')).toHaveLength(1)
  })
})

describe('moving in the guide', () => {
  it('moves one row per 100 ms and wraps', () => {
    const r = hand({ ...CTX, playingId: 'a' })
    r.press('Enter', 0)
    r.press('ArrowRight', 500) // All: 3 rows, playing A
    expect(r.state.guide).toEqual({ group: 1, row: 0 })
    r.press('ArrowDown', 1000)
    r.press('ArrowDown', 1050)
    r.press('ArrowDown', 1100)
    expect(r.state.guide?.row).toBe(2)
    r.press('ArrowDown', 1300)
    expect(r.state.guide?.row).toBe(0)
    r.press('ArrowUp', 1500)
    expect(r.state.guide?.row).toBe(2)
  })

  it('changes group, wraps, and stands on the playing channel or the first', () => {
    const r = hand({ ...CTX, playingId: 'c' })
    r.press('Enter', 0)
    expect(r.state.guide).toEqual({ group: 1, row: 2 }) // Favorites does not hold C
    expect(r.press('ArrowRight', 500).claimed).toBe(true)
    expect(r.state.guide).toEqual({ group: 0, row: 0 })
    r.press('ArrowLeft', 1000)
    expect(r.state.guide).toEqual({ group: 1, row: 2 })
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

  it('never points outside a list that shrank', () => {
    const r = hand({ ...CTX, playingId: 'c' })
    r.press('Enter', 0)
    const shrunk: RemoteContext = { surf: [A], groups: [{ key: 'all', label: 'All', streams: [A] }], playingId: null }
    r.press('ArrowDown', 500, shrunk)
    expect(r.state.guide).toEqual({ group: 0, row: 0 })
    r.tick(600, { surf: [], groups: [], playingId: null })
    expect(r.state.guide).toBeNull()
    expect(clampGuide({ group: 7, row: 9 }, GROUPS)).toEqual({ group: 1, row: 2 })
    expect(clampGuide({ group: 0, row: 0 }, [])).toBeNull()
  })
})

describe('Left and Right with the guide closed', () => {
  it('are left alone', () => {
    const r = hand()
    expect(r.press('ArrowLeft', 0).claimed).toBe(false)
    expect(r.effects).toHaveLength(0)
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
    r.press('BrowserBack', 0)
    expect(r.of('backHint')).toHaveLength(1)
    for (let t = 400; t <= 2500; t += 50) r.press('BrowserBack', t)
    expect(r.of('leave')).toHaveLength(0)
  })

  it('leaves on a second press within 3 s', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    r.press('BrowserBack', 1200)
    expect(r.of('leave')).toHaveLength(1)
  })

  it('asks again after 3 s', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    r.press('BrowserBack', 3001)
    expect(r.of('leave')).toHaveLength(0)
    expect(r.of('backHint')).toHaveLength(2)
  })

  it('leaves on a quick second press once the key was seen to come up', () => {
    const r = hand()
    r.press('BrowserBack', 0)
    r.release('BrowserBack', 100)
    r.press('BrowserBack', 300)
    expect(r.of('leave')).toHaveLength(1)
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

it.each(['MediaPlayPause', 'a', 'ColorF0Red', 'AudioVolumeUp'])('leaves %s alone', (key) => {
  const r = hand()
  r.press('Enter', 0)
  const before = r.state
  const result = r.press(key, 1000)
  expect(result.claimed).toBe(false)
  expect(r.state).toEqual(before)
})
