import type { StreamEntry, StreamSnapshot } from '../../streamsApi'
import { guideGroups, step, surfList } from '../surf'

const entry = (id: string, groups: number[]): StreamEntry => ({ id, name: id.toUpperCase(), groups, country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: `https://h.test/${id}.m3u8` })
const A = entry('a', [0])
const B = entry('b', [1])
const C = entry('c', [0, 1])
const LIST: StreamSnapshot = { generated: '', defaultId: null, groups: ['News', 'Sports', 'Empty'], streams: [A, B, C] }
const ids = (list: StreamEntry[]) => list.map((s) => s.id)

describe('surfList', () => {
  it('is the favorites, in the order of the list', () => {
    expect(ids(surfList(LIST, ['c', 'a'], 'Sports'))).toEqual(['a', 'c'])
  })

  it('skips a favorite that has left the list', () => {
    expect(ids(surfList(LIST, ['gone', 'b'], null))).toEqual(['b'])
  })

  it('is the group when no favorite is left, and everything when there is no such group', () => {
    expect(ids(surfList(LIST, ['gone'], 'Sports'))).toEqual(['b', 'c'])
    expect(ids(surfList(LIST, [], 'Gone group'))).toEqual(['a', 'b', 'c'])
    expect(ids(surfList(LIST, [], 'Empty'))).toEqual(['a', 'b', 'c'])
    expect(ids(surfList(LIST, [], null))).toEqual(['a', 'b', 'c'])
  })

  it('is empty without a list', () => {
    expect(surfList(null, ['a'], 'News')).toEqual([])
  })
})

describe('step', () => {
  it('moves and wraps at both ends', () => {
    expect(step([A, B, C], 'a', 1)).toBe(B)
    expect(step([A, B, C], 'c', 1)).toBe(A)
    expect(step([A, B, C], 'a', -1)).toBe(C)
    expect(step([A, B, C], 'b', 3)).toBe(B)
    expect(step([A, B, C], 'b', -4)).toBe(A)
  })

  it('starts at an end when the current channel is not in the list', () => {
    expect(step([A, B, C], 'zzz', 1)).toBe(A)
    expect(step([A, B, C], null, -1)).toBe(C)
  })

  it('has nowhere to go in an empty list', () => {
    expect(step([], 'a', 1)).toBeNull()
  })
})

describe('guideGroups', () => {
  it('is Favorites, All and the list’s groups, leaving empty ones out', () => {
    const groups = guideGroups(LIST, ['b', 'gone'])
    expect(groups.map((g) => [g.key, g.label, ids(g.streams)])).toEqual([
      ['favorites', 'Favorites', ['b']],
      ['all', 'All', ['a', 'b', 'c']],
      ['group:News', 'News', ['a', 'c']],
      ['group:Sports', 'Sports', ['b', 'c']],
    ])
    expect(guideGroups(LIST, []).map((g) => g.key)[0]).toBe('all')
  })

  it('is empty without a list', () => {
    expect(guideGroups(null, ['a'])).toEqual([])
  })
})
