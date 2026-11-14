import type { StreamEntry } from './streamsApi'

export interface StreamQuery {
  /** Words that must all appear in the name, in any order. Ignores case and accents. */
  text: string
  /** An index into the snapshot's groups, or null for every stream. */
  group: number | null
}

const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// A stream's folded name never changes, and the list is searched on every keystroke.
const foldedNames = new WeakMap<StreamEntry, string>()

function foldedName(stream: StreamEntry): string {
  let name = foldedNames.get(stream)
  if (name === undefined) {
    name = fold(stream.name)
    foldedNames.set(stream, name)
  }
  return name
}

/** The streams that match the query, in their original order. The text is plain text: no pattern characters. */
export function filterStreams(streams: StreamEntry[], query: StreamQuery): StreamEntry[] {
  const words = fold(query.text).split(/\s+/).filter(Boolean)
  if (words.length === 0 && query.group === null) return streams
  return streams.filter((stream) => {
    if (query.group !== null && !stream.groups.includes(query.group)) return false
    if (words.length === 0) return true
    const name = foldedName(stream)
    return words.every((word) => name.includes(word))
  })
}

/** How many streams each group holds (a stream counts once for each of its groups). */
export function groupCounts(streams: StreamEntry[], groupCount: number): number[] {
  const counts = new Array<number>(groupCount).fill(0)
  for (const stream of streams) {
    for (const index of stream.groups) {
      if (index >= 0 && index < groupCount) counts[index] += 1
    }
  }
  return counts
}
