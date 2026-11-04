import { useEffect, useRef } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import ChatSource from '../components/chat/ChatSource'
import { createPopoutBus, saveBounds } from '../lib/chatPopout'
import type { PopoutBus, WindowBounds } from '../lib/chatPopout'

const BOUNDS_SAMPLE_MS = 1000

/** Content size (what window.open's features mean), not the outer size with the frame. */
function readBounds(): WindowBounds {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    left: window.screenX,
    top: window.screenY,
  }
}

interface ChatPopoutPageProps {
  /** For tests; defaults to a BroadcastChannel bus. */
  bus?: PopoutBus
}

/**
 * The chat in a window of its own: only the chat, none of the page chrome (it
 * is routed outside AppLayout). It tells the main window it is alive, follows
 * the channel the main window is watching, closes when asked, and remembers
 * where the viewer put it so the next pop-out opens in the same place.
 */
export default function ChatPopoutPage({ bus: injectedBus }: ChatPopoutPageProps) {
  const { channel = '' } = useParams<{ channel: string }>()
  // The PRISM tab that opened this window. Empty when the page was loaded
  // directly, which no tab uses, so such a window answers nobody and obeys nobody.
  const [searchParams] = useSearchParams()
  const owner = searchParams.get('owner') ?? ''
  const navigate = useNavigate()

  // The bus effect below runs once; these keep it reading the latest values.
  const channelRef = useRef(channel)
  const ownerRef = useRef(owner)
  const navigateRef = useRef(navigate)
  useEffect(() => {
    channelRef.current = channel
    ownerRef.current = owner
    navigateRef.current = navigate
  })

  useEffect(() => {
    document.title = `${channel} chat`
  }, [channel])

  useEffect(() => {
    const bus = injectedBus ?? createPopoutBus()
    bus.post({ type: 'hello', owner: ownerRef.current, channel: channelRef.current })

    const unsubscribe = bus.subscribe((msg) => {
      if (msg.owner !== ownerRef.current) return // another tab's pop-out
      switch (msg.type) {
        case 'ping':
          bus.post({ type: 'hello', owner: ownerRef.current, channel: channelRef.current })
          break
        case 'set-channel':
          // Keep the owner in the URL, or a reload of this window would orphan it.
          navigateRef.current(
            {
              pathname: `/chat/${encodeURIComponent(msg.channel)}`,
              search: ownerRef.current ? `?owner=${encodeURIComponent(ownerRef.current)}` : '',
            },
            { replace: true },
          )
          break
        case 'close':
          window.close()
          break
      }
    })

    let lastSaved = ''
    const saveIfChanged = () => {
      const bounds = readBounds()
      const serialised = JSON.stringify(bounds)
      if (serialised === lastSaved) return
      lastSaved = serialised
      saveBounds(bounds)
    }
    const onPageHide = () => {
      saveBounds(readBounds())
      bus.post({ type: 'closed', owner: ownerRef.current })
    }

    // There is no window "move" event, so position is sampled as well as read on resize.
    const sampler = setInterval(saveIfChanged, BOUNDS_SAMPLE_MS)
    window.addEventListener('resize', saveIfChanged)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      unsubscribe()
      clearInterval(sampler)
      window.removeEventListener('resize', saveIfChanged)
      window.removeEventListener('pagehide', onPageHide)
      if (!injectedBus) bus.close()
    }
  }, [injectedBus])

  return (
    <div className="h-screen w-screen" style={{ backgroundColor: 'var(--bg)' }}>
      <ChatSource channel={channel} />
    </div>
  )
}
