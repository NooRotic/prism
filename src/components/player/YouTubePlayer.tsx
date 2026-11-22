import { useEffect, useRef, useState } from 'react'
import ReactPlayer from 'react-player'
import { VolumeX } from 'lucide-react'
import type { PlayerProps } from '../../types/player'
import { setPlayerMetrics, makeMetrics } from '../../lib/playerMetrics'
import { readSavedVolume, saveVolume } from '../../lib/playerVolume'

/**
 * YouTube player wrapping react-player. Handles both VOD
 * (youtube.com/watch?v=X, youtu.be/X) and live (youtube.com/live/X)
 * URLs — react-player's URL detection routes them to the right
 * iframe API under the hood.
 *
 * Kept thin: no init effect, no callback refs, because react-player
 * manages its own lifecycle and invokes our callback props directly.
 * PlayerHost's memoized handleReady/handleError callbacks don't
 * cause re-init issues here the way they would for video.js —
 * react-player's internal state isn't tied to our callbacks.
 */
/** How long sound autoplay gets to start before the player goes back to a muted start. */
const SOUND_AUTOPLAY_GRACE_MS = 3000

/** True once the visitor has clicked, tapped or pressed a key in this window. */
const wasUsed = (win: Window): boolean => win.navigator?.userActivation?.hasBeenActive === true

/**
 * True once the visitor has used this page, or the window that frames it: the browsers then allow sound autoplay. The
 * second case is the floating video window, which loads this page in a frame right after the visitor clicks its
 * "Click to enable sound" button: the click was in the window around the frame, not in the frame, and the frame's
 * `allow="autoplay"` hands it that permission. A parent on another origin cannot be read, and counts as not used.
 */
function hasInteracted(): boolean {
  if (typeof window === 'undefined') return false
  if (wasUsed(window)) return true
  try {
    return window.parent !== window && wasUsed(window.parent)
  } catch {
    return false
  }
}

export default function YouTubePlayer({
  url,
  onReady,
  onError,
  onPlay,
  onPause,
  onEnded,
}: PlayerProps) {
  // The viewer's saved volume. A change is saved only once playback has begun, so an early report of the element's
  // default volume cannot overwrite it.
  const [savedVolume] = useState(readSavedVolume)
  const playedRef = useRef(false)

  // Mute is state, not a constant. The player is told `muted` on every render, so a constant `true` re-muted the viewer
  // whenever the page re-rendered after they unmuted (about a third of the time). Now it starts as the browser allows,
  // then follows what the viewer does with the player's own controls.
  //  - A visitor who has already interacted with the page (they clicked a video to get here) may hear sound at once.
  //  - A direct load has no interaction yet, so it starts muted or the browser would block it.
  //  - If sound autoplay is blocked anyway (nothing plays within 3 s), it falls back to a muted start.
  const [muted, setMuted] = useState(() => !hasInteracted())
  // True while the mute is the browser's doing, not the viewer's: then a "Playing muted" pill offers the sound back.
  const [browserMuted, setBrowserMuted] = useState(muted)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    if (muted) return
    const timer = setTimeout(() => {
      if (!playedRef.current) {
        setMuted(true)
        setBrowserMuted(true)
      }
    }, SOUND_AUTOPLAY_GRACE_MS)
    return () => clearTimeout(timer)
  }, [muted, url])

  // Minimal metrics emission — react-player doesn't expose a
  // playbackStats API, so we can only report the engine name + the
  // lifecycle state we know from events. Bitrate/buffer/resolution
  // stay null because YouTube's iframe API doesn't surface them.
  // Cleanup on unmount clears the store so stale data doesn't show.
  useEffect(() => {
    setPlayerMetrics(makeMetrics('reactplayer'))
    return () => {
      setPlayerMetrics(null)
    }
  }, [url])

  const emitState = (partial: Partial<ReturnType<typeof makeMetrics>>) => {
    setPlayerMetrics(makeMetrics('reactplayer', partial))
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: 300 }}>
      <ReactPlayer
        src={url}
        playing
        controls
        // Muted only when the browser needs it (see above); the viewer's own mute and unmute are followed.
        muted={muted}
        volume={savedVolume ?? undefined}
        onVolumeChange={(event) => {
          if (!playedRef.current) return
          saveVolume(event.currentTarget.volume)
          const reported = event.currentTarget.muted
          if (typeof reported === 'boolean') {
            // A change the viewer made with the player's own controls: from now on the mute (or sound) is theirs.
            if (reported !== muted) setBrowserMuted(false)
            setMuted(reported)
          }
        }}
        width="100%"
        height="100%"
        onReady={() => {
          emitState({ paused: false, muted })
          onReady?.()
        }}
        onPlay={() => {
          playedRef.current = true
          setPlaying(true)
          emitState({ paused: false, muted })
          onPlay?.()
        }}
        onPause={() => {
          emitState({ paused: true, muted })
          onPause?.()
        }}
        onEnded={() => {
          emitState({ paused: true, muted })
          onEnded?.()
        }}
        onError={() => onError?.('YouTube player encountered an error')}
        config={{
          youtube: {
            enablejsapi: 1,
          },
        }}
      />
      {playing && muted && browserMuted && (
        // Inside the player, above YouTube's control bar, so the page, the chat dock and the pop-out window all get it.
        <div
          role="status"
          aria-label="Playing muted"
          className="absolute bottom-14 left-3 flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm"
          style={{ background: 'rgba(0,0,0,0.8)', color: '#fff', border: '1px solid var(--accent-orange)' }}
        >
          <VolumeX size={16} aria-hidden="true" style={{ color: 'var(--accent-orange)' }} />
          <span>Playing muted</span>
          <button
            type="button"
            onClick={() => {
              setMuted(false)
              setBrowserMuted(false)
            }}
            className="cursor-pointer rounded-full px-3 py-0.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-green)]"
            style={{ background: 'var(--accent-green)', color: '#000', border: 'none' }}
          >
            Turn sound on
          </button>
        </div>
      )}
    </div>
  )
}
