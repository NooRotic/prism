import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdminResult } from '../../lib/adminApi'
import { useAdminSession } from './AdminSessionContext'

export interface AdminResource<T> {
  /** `loading` until the first answer for the current inputs; `error` for anything but a good answer. */
  status: 'loading' | 'ready' | 'error'
  data: T | null
  /** Asks again (the status goes back to `loading`). */
  reload: () => void
}

interface Loaded<T> {
  key: string
  result: AdminResult<T>
}

/**
 * Loads one admin read for a screen. `deps` are the primitive inputs that change what is asked (the window in
 * days, a search text); a change starts a new request and drops the old one. An answer of "signed out" ends the
 * admin session instead of showing an error. The screen never throws: every other failure is `error`.
 */
export function useAdminResource<T>(load: (signal: AbortSignal) => Promise<AdminResult<T>>, deps: readonly (string | number)[]): AdminResource<T> {
  const { onExpired } = useAdminSession()
  const [version, setVersion] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  const key = `${version}:${JSON.stringify(deps)}`
  useEffect(() => {
    const controller = new AbortController()
    void loadRef.current(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (result.kind === 'signed_out') onExpired()
      else setLoaded({ key, result })
    })
    return () => controller.abort()
  }, [key, onExpired])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  if (loaded?.key !== key) return { status: 'loading', data: null, reload }
  if (loaded.result.kind !== 'ok') return { status: 'error', data: null, reload }
  return { status: 'ready', data: loaded.result.data, reload }
}
