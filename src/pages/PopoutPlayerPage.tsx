import { useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import PlayerHost from '../components/player/PlayerHost'
import { parsePopoutPlayerQuery } from '../lib/floatingVideo'
import { detectURLType, detectURLTypeAs } from '../lib/urlDetection'

/** What this page tells the window that holds it when it cannot play: the window then closes and says so. */
export const POPOUT_FAILED_MESSAGE = 'prism-popout-failed'

/** Only the window that embeds this page hears it, and only from this origin. */
function tellOpenerItFailed() {
  if (window.parent === window) return
  window.parent.postMessage({ type: POPOUT_FAILED_MESSAGE }, window.location.origin)
}

function FailureReport() {
  useEffect(tellOpenerItFailed, [])
  return null
}

/**
 * The video in the small floating window: a YouTube video or a pasted stream in the app's own player, with nothing
 * else on the page (it is routed outside the layout, like the chat pop-out). The floating window loads it in a
 * frame and changes the frame's address when the page it follows moves to another video.
 */
export default function PopoutPlayerPage() {
  const { search } = useLocation()
  const source = useMemo(() => parsePopoutPlayerQuery(search), [search])

  useEffect(() => {
    if (!source) tellOpenerItFailed()
  }, [source])

  if (!source) return null

  const [url, detection] =
    source.kind === 'youtube'
      ? (() => {
          const address = `https://www.youtube.com/watch?v=${source.videoId}${source.startSec ? `&t=${source.startSec}s` : ''}`
          return [address, detectURLType(address)] as const
        })()
      : ([source.url, detectURLTypeAs(source.url, source.streamKind)] as const)

  return (
    <div className="fixed inset-0 bg-black">
      <PlayerHost url={url} detection={detection} renderError={() => <FailureReport />} />
    </div>
  )
}
