import { useCallback, useEffect, useRef, useState } from 'react'
import { useLinkedAccount } from '../../hooks/useLinkedAccount'
import { fastYoutubeChatTarget, findYoutubeChatTarget, type LinkedYoutube } from '../../lib/youtubeChatLookup'
import { decodeTarget, encodeTarget } from '../../lib/youtubeChatTarget'
import { useChatPopout } from './useChatPopout'

/**
 * The linked streamer's YouTube live chat in its own pop-out window, beside the Twitch one. The window has to open
 * inside the click, so it opens "looking" and gets the stream once the lookup answers (2 units, or 0 from a fresh rail
 * answer). While it is open it follows the Twitch page: another linked streamer is looked up once, an unlinked one says
 * so. Nothing is looked up while it is closed.
 */
export function useYoutubeChatPopout(twitchLogin: string | undefined) {
  const login = twitchLogin ?? ''
  const yt = useLinkedAccount(login)?.youtube ?? null
  const link: LinkedYoutube | null = yt ? { channelId: yt.channelId, title: yt.title } : null
  // What is being shown is tied to whom it is for, so an answer for an earlier streamer can never stand for this one.
  const key = link ? `yt:${link.channelId}` : `none:${login}`
  const [found, setFound] = useState<{ key: string; value: string } | null>(null)
  const channelId = link?.channelId
  const title = link?.title
  const target =
    found?.key === key ? found.value : link ? encodeTarget({ kind: 'looking' }) : encodeTarget({ kind: 'none', name: login })

  /** The streamer the latest lookup is for; an answer for anyone else is dropped. */
  const requestedRef = useRef<string | null>(null)

  // Read by the window-hello callback, which runs from the bus, outside render.
  const keyRef = useRef(key)
  const channelIdRef = useRef(channelId)
  useEffect(() => {
    keyRef.current = key
    channelIdRef.current = channelId
  })

  /** A window already showing this streamer's stream (a reloaded page re-attaching) is kept as it is. */
  const onWindowHello = useCallback((windowChannel: string) => {
    const t = decodeTarget(windowChannel)
    if (channelIdRef.current === undefined || t.kind !== 'video' || t.channelId !== channelIdRef.current) return false
    requestedRef.current = keyRef.current
    setFound({ key: keyRef.current, value: windowChannel })
    return true
  }, [])

  const popout = useChatPopout(target, undefined, 'youtube', onWindowHello)

  const lookUp = useCallback((forKey: string, forLink: LinkedYoutube) => {
    requestedRef.current = forKey
    void findYoutubeChatTarget(forLink).then((t) => {
      if (requestedRef.current === forKey) setFound({ key: forKey, value: encodeTarget(t) })
    })
  }, [])

  const { open: openWindow, isOpen } = popout

  const open = useCallback(() => {
    if (!channelId || title === undefined) return
    const forLink = { channelId, title }
    const fast = fastYoutubeChatTarget(forLink)
    const first = encodeTarget(fast ?? { kind: 'looking' })
    if (fast) {
      requestedRef.current = key
      setFound({ key, value: first })
    }
    openWindow(first)
    if (!fast) lookUp(key, forLink)
  }, [channelId, title, key, openWindow, lookUp])

  // Follow the Twitch page while the window is open.
  useEffect(() => {
    if (!isOpen || requestedRef.current === key) return
    if (channelId && title !== undefined) lookUp(key, { channelId, title })
    else requestedRef.current = key
  }, [isOpen, key, channelId, title, lookUp])

  return { available: link !== null, isOpen, blocked: popout.blocked, open }
}
