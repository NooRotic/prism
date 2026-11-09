import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../../contexts/AppContext'
import {
  canPopOutOn,
  floatingChannelFromPath,
  floatingShouldEnd,
  isFloatingSupported,
  loadFloatSize,
  saveFloatSize,
} from '../../lib/floatingVideo'
import { openFloatingWindow } from '../../lib/floatingWindow'
import type { FloatingSession } from '../../lib/floatingWindow'
import { FloatingVideoContext } from './floatingVideoContext'
import type { FloatingVideoControls } from './floatingVideoContext'

/** How long a notice ("could not open", "could not start") stays, the same as the chat pop-out's. */
const NOTICE_MS = 6000

/**
 * What the viewer is told about a window that did not work out. `id` counts, so showing a
 * notice again while one is still up is a new value and its time starts over.
 */
interface Notice {
  kind: 'blocked' | 'failed'
  id: number
}

/**
 * Owns the floating video window for the whole app. It sits above the routes
 * because the window must outlive any one page: moving between channels keeps
 * it open and switches what it shows, and leaving for a page with no dock
 * unmounts the page that opened it.
 *
 * `isFloating` follows the window actually existing (the session's own
 * `onClosed`), never a flag of its own, so a window closed by any route
 * (its X, back-to-tab, the tab reloading) cannot leave the page stuck.
 */
export default function FloatingVideoProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { state } = useApp()
  const detection = state.player.detection
  const channel = floatingChannelFromPath(pathname)

  const [supported] = useState(() => isFloatingSupported())
  const [isFloating, setIsFloating] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const sessionRef = useRef<FloatingSession | null>(null)
  const openingRef = useRef(false)
  const mountedRef = useRef(true)
  /** The channel the window was last told to show, so only a real change is sent on. */
  const shownChannelRef = useRef<string | null>(null)

  const handleClosed = useCallback(() => {
    sessionRef.current = null
    shownChannelRef.current = null
    setIsFloating(false)
  }, [])

  const close = useCallback(() => {
    sessionRef.current?.close()
  }, [])

  const showNotice = useCallback((kind: Notice['kind']) => {
    setNotice((previous) => ({ kind, id: (previous?.id ?? 0) + 1 }))
  }, [])

  // The player could not start inside the window: close it, and say so rather than leave the
  // viewer wondering where the window went.
  const handleFailed = useCallback(() => {
    showNotice('failed')
    close()
  }, [showNotice, close])

  const open = useCallback(() => {
    if (!supported || !channel || sessionRef.current || openingRef.current) return
    openingRef.current = true
    shownChannelRef.current = channel
    // Called synchronously: the browser only allows the request inside the click.
    openFloatingWindow({
      channel,
      parent: window.location.hostname,
      size: loadFloatSize(),
      onClosed: handleClosed,
      onFailed: handleFailed,
      onResize: saveFloatSize,
    })
      .then((session) => {
        if (!mountedRef.current) {
          session.close()
          return
        }
        // Already gone before it was handed over: nothing to show.
        if (session.closed) return
        sessionRef.current = session
        setNotice(null)
        setIsFloating(true)
      })
      .catch(() => {
        shownChannelRef.current = null
        showNotice('blocked')
      })
      .finally(() => {
        openingRef.current = false
      })
  }, [supported, channel, handleClosed, handleFailed, showNotice])

  // The window follows the channel opened in the page; off a channel page it keeps what it has.
  useEffect(() => {
    if (!isFloating || !channel || channel === shownChannelRef.current) return
    shownChannelRef.current = channel
    sessionRef.current?.setChannel(channel)
  }, [isFloating, channel])

  // A page that plays its own video ends the window, so two things never play at once. A clip or
  // VOD only counts when it is started while a channel page is showing: the last thing played
  // can be a clip from an earlier page (one pasted on the hub), and reaching a channel must not
  // end the window before that page has replaced it with its own stream. Every PLAY_URL stores
  // a fresh `detection` object, so a change of it is a start.
  const seenDetectionRef = useRef(detection)
  useEffect(() => {
    const startedNow = detection !== seenDetectionRef.current
    seenDetectionRef.current = detection
    if (!isFloating) return
    if (floatingShouldEnd(pathname, startedNow ? detection : null)) sessionRef.current?.close()
  }, [isFloating, pathname, detection])

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(id)
  }, [notice])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      sessionRef.current?.close()
    }
  }, [])

  const value = useMemo<FloatingVideoControls>(
    () => ({
      supported,
      canOpen: supported && !isFloating && canPopOutOn(pathname, detection),
      isFloating,
      blocked: notice?.kind === 'blocked',
      failed: notice?.kind === 'failed',
      open,
      close,
    }),
    [supported, isFloating, pathname, detection, notice, open, close],
  )

  return <FloatingVideoContext.Provider value={value}>{children}</FloatingVideoContext.Provider>
}
