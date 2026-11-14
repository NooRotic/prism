import { useCallback, useEffect, useState } from 'react'

export interface AutoFold {
  open: boolean
  pinned: boolean
  /** Starts the countdown again (the visitor is using the panel). */
  bump: () => void
  /** Opens a folded panel. */
  reopen: () => void
  togglePin: () => void
}

/**
 * A panel that opens when something new starts (`resetKey` changes), folds after `ms` of being left alone, and can be
 * pinned open. The countdown only runs while the page is visible: a tab in the background does not use it up.
 */
export function useAutoFold(resetKey: string, ms = 30_000): AutoFold {
  const [open, setOpen] = useState(true)
  const [pinned, setPinned] = useState(false)
  const [restarts, setRestarts] = useState(0)
  const [lastKey, setLastKey] = useState(resetKey)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)

  // A new key reopens the panel and restarts the countdown. Done while rendering (not in an effect), so the folded
  // panel is never drawn for a frame with the new stream's details.
  if (resetKey !== lastKey) {
    setLastKey(resetKey)
    setOpen(true)
    setRestarts((n) => n + 1)
  }

  useEffect(() => {
    const onChange = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  // Every dependency below is a reason to start the countdown over: the panel opened, it was pinned or unpinned, the
  // visitor bumped it, the page came back to the foreground, or the key changed (it bumps `restarts`).
  useEffect(() => {
    if (!open || pinned || hidden) return
    const timer = setTimeout(() => setOpen(false), ms)
    return () => clearTimeout(timer)
  }, [open, pinned, hidden, restarts, ms])

  const bump = useCallback(() => setRestarts((n) => n + 1), [])
  const reopen = useCallback(() => {
    setOpen(true)
    setRestarts((n) => n + 1)
  }, [])
  const togglePin = useCallback(() => setPinned((p) => !p), [])

  return { open, pinned, bump, reopen, togglePin }
}
