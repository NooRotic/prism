import { useState, useEffect } from 'react'
import { getUsersByIds } from '../lib/twitchApi'

/**
 * Batched profile-image lookup for rail entries.
 *
 * `EnrichedFollow` has no avatar field — its `thumbnailUrl` is the stream
 * preview, not the profile picture — so the rail needs a second join against
 * /users. The rail lists every live follow, which can pass Helix's 100-id cap;
 * getUsersByIds splits the ids into capped requests itself.
 *
 * Avatars never block the rail. A rejected or partial fetch resolves to a
 * map missing those ids, and the cards render initial-letter circles.
 */
export function useRailAvatars(userIds: string[]): Map<string, string> {
  const [avatars, setAvatars] = useState<Map<string, string>>(() => new Map())

  // Membership key, not array identity. Callers derive `userIds` inside
  // render, so a fresh array arrives every render with identical contents;
  // keying the effect on identity would refetch on every keystroke elsewhere
  // in the tree.
  const key = [...userIds].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing cached avatars when the rail empties (logout / no live follows)
      setAvatars((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }

    let cancelled = false
    getUsersByIds(ids)
      .then((users) => {
        if (cancelled) return
        const next = new Map<string, string>()
        for (const u of users) next.set(u.id, u.profile_image_url)
        setAvatars(next)
      })
      .catch(() => {
        if (!cancelled) setAvatars(new Map())
      })

    return () => {
      cancelled = true
    }
  }, [key])

  return avatars
}
