import { useEffect, useRef, useState } from 'react'
import { SessionExpiredError } from '../lib/twitchApi'

/** One independently loading piece of the streamer row or the 30-day panels. */
export interface Section<T> {
  data: T | null
  loading: boolean
  error: string | null
}

interface Settled<T> {
  key: string
  data: T | null
  error: string | null
}

/**
 * Loads one section for a key (a broadcaster id) and holds the outcome. A null key makes no
 * request. A new key shows `loading` until its own answer arrives, never the previous key's data.
 * An expired session is reported through `onSessionExpired`, because that one means the viewer has
 * to sign in again; every other failure stays inside the section as its `error`.
 */
export function useSection<T>(
  key: string | null,
  load: (key: string) => Promise<T>,
  onSessionExpired: () => void,
): Section<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  // Read the latest callbacks from refs so a new function each render does not refetch.
  const loadRef = useRef(load)
  const expiredRef = useRef(onSessionExpired)
  useEffect(() => {
    loadRef.current = load
    expiredRef.current = onSessionExpired
  })

  useEffect(() => {
    if (!key) return
    let cancelled = false
    loadRef
      .current(key)
      .then((data) => {
        if (!cancelled) setSettled({ key, data, error: null })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        if (error instanceof SessionExpiredError) expiredRef.current()
        setSettled({ key, data: null, error: error instanceof Error ? error.message : 'Request failed' })
      })
    return () => {
      cancelled = true
    }
  }, [key])

  if (!key) return { data: null, loading: false, error: null }
  if (settled?.key !== key) return { data: null, loading: true, error: null }
  return { data: settled.data, loading: false, error: settled.error }
}
