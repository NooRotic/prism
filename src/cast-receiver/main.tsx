import './tv.css'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { CAST_NAMESPACE, parseContext, type ContextMessage, type NowMessage } from '../lib/cast/messages'
import { createCastEngine } from './castEngine'
import { quietCast } from './quietCast'
import TvApp, { type TvAppProps } from './TvApp'

/** A sender that comes back after a reload may start listening a moment after it is announced, so it is told twice. */
const TELL_AGAIN_MS = 1_500

function draw(props: TvAppProps): void {
  const root = createRoot(document.getElementById('root') as HTMLElement)
  // At once, so the page is listening before Cast can hand it anything.
  flushSync(() => root.render(<TvApp {...props} />))
}

function startOnTv(): void {
  const { framework } = cast
  const context = framework.CastReceiverContext.getInstance()
  let last: NowMessage | null = null
  let ready = false
  const contextListeners = new Set<(message: ContextMessage) => void>()

  const tell = (senderId?: string) => {
    if (!ready || last === null) return
    try {
      context.sendCustomMessage(CAST_NAMESPACE, senderId, last)
    } catch {
      /* nobody is connected */
    }
  }

  draw({
    engine: createCastEngine(context.getPlayerManager()),
    sendNow: (message) => {
      last = message
      tell()
    },
    leave: () => context.stop(),
    onContext: (listener) => {
      contextListeners.add(listener)
      return () => {
        contextListeners.delete(listener)
      }
    },
  })
  quietCast()

  context.addEventListener(framework.system.EventType.READY, () => {
    ready = true
    tell()
  })
  context.addEventListener(framework.system.EventType.SENDER_CONNECTED, (event) => {
    tell(event.senderId)
    setTimeout(() => tell(event.senderId), TELL_AGAIN_MS)
  })
  context.addCustomMessageListener(CAST_NAMESPACE, (event) => {
    const message = parseContext(event.data)
    if (message) for (const listener of [...contextListeners]) listener(message)
  })

  const options = new framework.CastReceiverOptions()
  options.customNamespaces = { [CAST_NAMESPACE]: framework.system.MessageType.JSON }
  options.useShakaForHls = true
  context.start(options)
}

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('dev')) {
  // On the dev server only: the page with a pretend player, driven by the keyboard.
  void import('./devStandIn').then(({ devProps }) => devProps().then(draw))
} else {
  startOnTv()
}
