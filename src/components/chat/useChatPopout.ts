import { useCallback, useEffect, useRef, useState } from 'react'
import {
  POPOUT_WINDOW_NAME,
  boundsToFeatures,
  buildPopoutUrl,
  createPopoutBus,
  loadBounds,
} from '../../lib/chatPopout'
import type { PopoutBus } from '../../lib/chatPopout'

const POLL_MS = 1000
const BLOCKED_NOTICE_MS = 6000

interface UseChatPopoutReturn {
  /** True while a pop-out window is alive. Runtime only, never persisted. */
  isOpen: boolean
  /** The browser refused the popup; clears itself after a few seconds. */
  blocked: boolean
  open: () => void
  close: () => void
}

/**
 * Opens the chat in its own window and keeps track of it. `isOpen` is derived
 * from the window actually being there (a hello on the bus, or a handle that
 * is not closed), so a closed browser can never leave the page stuck on
 * "popped out". Closing the window by any route, including the OS close
 * button, brings the chat back.
 */
export function useChatPopout(
  channel: string | undefined,
  injectedBus?: PopoutBus,
): UseChatPopoutReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)

  const busRef = useRef<PopoutBus | null>(null)
  /** Only set when this page opened the window; a re-attached pop-out has no handle. */
  const popupRef = useRef<Window | null>(null)
  /** The channel the pop-out is known to be showing. */
  const lastChannelRef = useRef<string | undefined>(undefined)

  // Listen, and ask whether a pop-out is already alive (a reloaded page re-attaches this way).
  useEffect(() => {
    const bus = injectedBus ?? createPopoutBus()
    busRef.current = bus
    const unsubscribe = bus.subscribe((msg) => {
      if (msg.type === 'hello') {
        lastChannelRef.current = msg.channel
        setBlocked(false)
        setIsOpen(true)
      } else if (msg.type === 'closed') {
        popupRef.current = null
        setIsOpen(false)
      }
    })
    bus.post({ type: 'ping' })
    return () => {
      unsubscribe()
      if (!injectedBus) bus.close()
      busRef.current = null
    }
  }, [injectedBus])

  // Notice a window closed with the OS button, which sends no message reliably.
  useEffect(() => {
    if (!isOpen) return
    const id = setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null
        setIsOpen(false)
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [isOpen])

  useEffect(() => {
    if (!blocked) return
    const id = setTimeout(() => setBlocked(false), BLOCKED_NOTICE_MS)
    return () => clearTimeout(id)
  }, [blocked])

  // The pop-out follows the channel being watched.
  useEffect(() => {
    if (!isOpen || !channel) return
    if (lastChannelRef.current === channel) return
    lastChannelRef.current = channel
    busRef.current?.post({ type: 'set-channel', channel })
  }, [channel, isOpen])

  const open = useCallback(() => {
    if (!channel) return
    // Must run inside the click handler, or popup blockers refuse it. No
    // `noopener`: it would make this return null and lose the handle.
    const popup = window.open(
      buildPopoutUrl(channel),
      POPOUT_WINDOW_NAME,
      boundsToFeatures(loadBounds()),
    )
    if (!popup) {
      setBlocked(true)
      return
    }
    popupRef.current = popup
    lastChannelRef.current = channel
    setBlocked(false)
    setIsOpen(true)
  }, [channel])

  const close = useCallback(() => {
    try {
      popupRef.current?.close()
    } catch {
      // already gone
    }
    popupRef.current = null
    // Covers a re-attached pop-out, which this page has no handle for.
    busRef.current?.post({ type: 'close' })
    setIsOpen(false)
  }, [])

  return { isOpen, blocked, open, close }
}
