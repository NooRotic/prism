import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
  const navigate = useNavigate()

  // The bus effect below runs once; these keep it reading the latest values.
  const channelRef = useRef(channel)
  const navigateRef = useRef(navigate)
  useEffect(() => {
    channelRef.current = channel
    navigateRef.current = navigate
  })

  useEffect(() => {
    document.title = `${channel} chat`
  }, [channel])

  useEffect(() => {
    const bus = injectedBus ?? createPopoutBus()
    bus.post({ type: 'hello', channel: channelRef.current })

    const unsubscribe = bus.subscribe((msg) => {
      switch (msg.type) {
        case 'ping':
          bus.post({ type: 'hello', channel: channelRef.current })
          break
        case 'set-channel':
          navigateRef.current(`/chat/${encodeURIComponent(msg.channel)}`, { replace: true })
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
      bus.post({ type: 'closed' })
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
