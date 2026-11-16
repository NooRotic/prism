import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { adjustFavoriteCount, getFavoriteCounts, loadFavoriteCounts, sendFavorite, subscribeFavoriteCounts, type FavoriteCounts } from '../lib/favoritesApi'
import { getFavorites, setFavorite, subscribeFavorites } from '../lib/favorites'

/** The viewer's starred stream ids (this browser only). */
export function useFavoriteIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeFavorites, getFavorites, getFavorites)
}

/** The server's star totals per stream, fetched once per page session. Empty until they arrive or when the server is down. */
export function useFavoriteCounts(): FavoriteCounts {
  useEffect(() => {
    void loadFavoriteCounts()
  }, [])
  return useSyncExternalStore(subscribeFavoriteCounts, getFavoriteCounts, getFavoriteCounts)
}

/**
 * Stars or un-stars a stream: saves it in this browser, tells the server +1 or -1 (only when the star really changed) and
 * moves the shown total by one at once.
 */
export function useToggleFavorite(): (id: string) => void {
  return useCallback((id: string) => {
    const on = !getFavorites().has(id)
    if (!setFavorite(id, on)) return
    sendFavorite(id, on)
    adjustFavoriteCount(id, on ? 1 : -1)
  }, [])
}
