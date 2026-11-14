import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useApp } from '../contexts/AppContext'
import { CUSTOM_STREAM_ID } from '../lib/routes'
import { resolveStreamSource } from '../lib/streamSource'
import StreamPlayerPanel from '../components/player/StreamPlayerPanel'

function StreamNotFound({ streamId, hasUrl }: { streamId: string | undefined; hasUrl: boolean }) {
  let message: string
  if (streamId && streamId !== CUSTOM_STREAM_ID) message = `No stream called “${streamId}”.`
  else if (!hasUrl) message = 'No stream address was given.'
  else message = "That address isn't an HLS, DASH or MP4 stream."

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-5xl mx-auto px-4 md:px-6 pt-12 pb-8 text-center">
      <p className="text-lg" style={{ color: 'var(--text-primary)' }}>
        {message}
      </p>
      <Link to="/hls-dash" className="text-sm underline" style={{ color: 'var(--accent-hls)' }}>
        Browse the HLS / DASH demos
      </Link>
    </div>
  )
}

export default function HlsDashPlayerPage() {
  const { streamId } = useParams<{ streamId: string }>()
  const [searchParams] = useSearchParams()
  const { state, dispatch } = useApp()

  // Render from what the address asks for, not from the app's player state: that state still holds
  // the previous stream for one frame after a navigation.
  const source = useMemo(
    () => resolveStreamSource(streamId, searchParams),
    [streamId, searchParams],
  )

  // The rest of the app (debug panel, floating window) reads what is playing from app state.
  useEffect(() => {
    if (!source) return
    if (
      state.player.currentUrl !== source.url ||
      state.player.detection?.type !== source.detection.type
    ) {
      dispatch({ type: 'PLAY_URL', url: source.url, detection: source.detection })
    }
  }, [source]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!source) return <StreamNotFound streamId={streamId} hasUrl={searchParams.has('url')} />
  return <StreamPlayerPanel key={`${source.url}|${source.detection.type}`} source={source} />
}
