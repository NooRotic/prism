import type { StreamEntry, StreamSnapshot } from '../streamsApi'

export interface GuideGroup {
  /** What the group is, not where it is: the list can change while the guide is open. */
  key: string
  label: string
  streams: StreamEntry[]
}

const inFavorites = (list: StreamSnapshot, favorites: readonly string[]): StreamEntry[] => {
  const wanted = new Set(favorites)
  return list.streams.filter((stream) => wanted.has(stream.id))
}

/**
 * What Up and Down move through: the viewer's favorites that are still in the list; with none, the group they cast from;
 * with none of those either, everything. Always in the list's own order.
 */
export function surfList(list: StreamSnapshot | null, favorites: readonly string[], group: string | null): StreamEntry[] {
  if (list === null) return []
  const starred = inFavorites(list, favorites)
  if (starred.length > 0) return starred
  const index = group === null ? -1 : list.groups.indexOf(group)
  const grouped = index === -1 ? [] : list.streams.filter((stream) => stream.groups.includes(index))
  return grouped.length > 0 ? grouped : list.streams
}

/** The channel `by` places on from the current one, round both ends. A current one that is not in the list starts at an end. */
export function step(list: StreamEntry[], currentId: string | null, by: number): StreamEntry | null {
  if (list.length === 0) return null
  const at = currentId === null ? -1 : list.findIndex((stream) => stream.id === currentId)
  if (at === -1) return by > 0 ? list[0] : list[list.length - 1]
  return list[(((at + by) % list.length) + list.length) % list.length]
}

/** The guide's groups: Favorites, All, then the list's own. Empty ones are left out. */
export function guideGroups(list: StreamSnapshot | null, favorites: readonly string[]): GuideGroup[] {
  if (list === null) return []
  const groups: GuideGroup[] = [
    { key: 'favorites', label: 'Favorites', streams: inFavorites(list, favorites) },
    { key: 'all', label: 'All', streams: list.streams },
    ...list.groups.map((label, index): GuideGroup => ({ key: `group:${label}`, label, streams: list.streams.filter((stream) => stream.groups.includes(index)) })),
  ]
  return groups.filter((group) => group.streams.length > 0)
}
