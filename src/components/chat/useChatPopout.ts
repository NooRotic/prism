import { useCallback, useEffect, useRef, useState } from 'react'
import {
  boundsToFeatures,
  buildPopoutUrl,
  createPopoutBus,
  getTabId,
  loadBounds,
  popoutNames,
} from '../../lib/chatPopout'
import type { ChatKind, PopoutBus } from '../../lib/chatPopout'

const POLL_MS = 1000
const BLOCKED_NOTICE_MS = 6000

interface UseChatPopoutReturn {
  /** True while a pop-out window is alive. Runtime only, never persisted. */
  isOpen: boolean
  /** The browser refused the popup; clears itself after a few seconds. */
  blocked: boolean
  /** `channelOverride` is for a caller that learns what to show in the same click (the YouTube chat). */
  open: (channelOverride?: string) => boolean
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
  kind: ChatKind = 'twitch',
  /**
   * Called when a window says hello with what it shows. Return true when that is already right for this page (a
   * reloaded page re-attaching), so it is kept instead of replaced.
   */
  onWindowHello?: (windowChannel: string) => boolean,
): UseChatPopoutReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const onHelloRef = useRef(onWindowHello)
  // Other PRISM tabs share the bus; this id says which pop-out is ours.
  const [tabId] = useState(getTabId)

  const busRef = useRef<PopoutBus | null>(null)
  /** Only set when this page opened the window; a re-attached pop-out has no handle. */
  const popupRef = useRef<Window | null>(null)
  /** The channel the pop-out is known to be showing. */
  const lastChannelRef = useRef<string | undefined>(undefined)
  /** What the pop-out should be showing; read by the bus handler, which is set up once. */
  const channelRef = useRef(channel)
  useEffect(() => {
    channelRef.current = channel
    onHelloRef.current = onWindowHello
  })

  // Listen, and ask whether a pop-out is already alive (a reloaded page re-attaches this way).
  useEffect(() => {
    const bus = injectedBus ?? createPopoutBus(kind)
    busRef.current = bus
    const unsubscribe = bus.subscribe((msg) => {
      if (msg.owner !== tabId) return // another tab's pop-out
      if (msg.type === 'hello') {
        lastChannelRef.current = msg.channel
        setBlocked(false)
        setIsOpen(true)
        // A change sent before the window was listening was lost: send what it should show now, unless what the
        // window shows is already right for this page (a reloaded page re-attaching).
        const want = channelRef.current
        const keep = onHelloRef.current?.(msg.channel) ?? false
        if (want && want !== msg.channel && !keep) {
          lastChannelRef.current = want
          bus.post({ type: 'set-channel', owner: tabId, channel: want })
        }
      } else if (msg.type === 'closed') {
        popupRef.current = null
        setIsOpen(false)
      }
    })
    bus.post({ type: 'ping', owner: tabId })
    return () => {
      unsubscribe()
      if (!injectedBus) bus.close()
      busRef.current = null
    }
  }, [injectedBus, tabId, kind])

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
    busRef.current?.post({ type: 'set-channel', owner: tabId, channel })
  }, [channel, isOpen, tabId])

  /** Opens the window; false when there was nothing to show or the browser blocked it. */
  const open = useCallback((channelOverride?: string): boolean => {
    // Buttons pass `open` straight to onClick, which hands it the click event: only a string overrides.
    const target = typeof channelOverride === 'string' ? channelOverride : channel
    if (!target) return false
    // Must run inside the click handler, or popup blockers refuse it. No
    // `noopener`: it would make this return null and lose the handle.
    const popup = window.open(
      buildPopoutUrl(target, tabId, kind),
      popoutNames(kind).windowName,
      boundsToFeatures(loadBounds(kind)),
    )
    if (!popup) {
      setBlocked(true)
      return false
    }
    popupRef.current = popup
    lastChannelRef.current = target
    setBlocked(false)
    setIsOpen(true)
    return true
  }, [channel, tabId, kind])

  const close = useCallback(() => {
    try {
      popupRef.current?.close()
    } catch {
      // already gone
    }
    popupRef.current = null
    // Covers a re-attached pop-out, which this page has no handle for.
    busRef.current?.post({ type: 'close', owner: tabId })
    setIsOpen(false)
  }, [tabId])

  return { isOpen, blocked, open, close }
}
