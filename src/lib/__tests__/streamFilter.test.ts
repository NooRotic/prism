import { filterStreams, groupCounts } from '../streamFilter'
import type { StreamEntry } from '../streamsApi'

function entry(name: string, groups: number[] = [0], id = name): StreamEntry {
  return { id, name, groups, country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: 'https://x.test/a.m3u8' }
}

const LIST: StreamEntry[] = [
  entry('Tele Sur', [0, 2]),
  entry('BBC News', [1]),
  entry('Télévision Française', [2]),
  entry('CNN International News', [1, 2]),
  entry('Zeta', [0]),
]

describe('filterStreams', () => {
  it('keeps everything, in order, for an empty query', () => {
    const result = filterStreams(LIST, { text: '', group: null })

    expect(result).toEqual(LIST)
    expect(filterStreams(LIST, { text: '   ', group: null })).toEqual(LIST)
  })

  it('needs every word, ignoring case and accents', () => {
    expect(filterStreams(LIST, { text: 'telé', group: null }).map((s) => s.name)).toEqual(['Tele Sur', 'Télévision Française'])
    expect(filterStreams(LIST, { text: 'TELEVISION', group: null }).map((s) => s.name)).toEqual(['Télévision Française'])
    expect(filterStreams(LIST, { text: 'news cnn', group: null }).map((s) => s.name)).toEqual(['CNN International News'])
    expect(filterStreams(LIST, { text: 'news nothing', group: null })).toEqual([])
    expect(filterStreams(LIST, { text: 'FRANCAISE', group: null }).map((s) => s.name)).toEqual(['Télévision Française'])
  })

  it('matches inside a word, not only at its start', () => {
    expect(filterStreams(LIST, { text: 'nter', group: null }).map((s) => s.name)).toEqual(['CNN International News'])
  })

  it('treats markup and pattern characters in the text as plain text', () => {
    expect(filterStreams(LIST, { text: '<b>', group: null })).toEqual([])
    expect(filterStreams(LIST, { text: '.*', group: null })).toEqual([])
    expect(filterStreams(LIST, { text: '(', group: null })).toEqual([])
    expect(filterStreams([entry('A (HD) [1080p]')], { text: '(hd) [10', group: null })).toHaveLength(1)
  })

  it('filters by group, and by group and text together', () => {
    expect(filterStreams(LIST, { text: '', group: 1 }).map((s) => s.name)).toEqual(['BBC News', 'CNN International News'])
    expect(filterStreams(LIST, { text: '', group: 2 }).map((s) => s.name)).toEqual(['Tele Sur', 'Télévision Française', 'CNN International News'])
    expect(filterStreams(LIST, { text: 'news', group: 2 }).map((s) => s.name)).toEqual(['CNN International News'])
    expect(filterStreams(LIST, { text: '', group: 9 })).toEqual([])
  })

  it('does not change the list it is given', () => {
    const before = [...LIST]

    filterStreams(LIST, { text: 'news', group: 1 })

    expect(LIST).toEqual(before)
  })
})

describe('groupCounts', () => {
  it('counts the streams of each group, counting a stream once for each of its groups', () => {
    expect(groupCounts(LIST, 3)).toEqual([2, 2, 3])
  })

  it('gives zeros for a list with no streams, and ignores an index that has no slot', () => {
    expect(groupCounts([], 3)).toEqual([0, 0, 0])
    expect(groupCounts([entry('X', [5])], 2)).toEqual([0, 0])
    expect(groupCounts(LIST, 0)).toEqual([])
  })
})
