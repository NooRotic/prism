import { useEffect, useMemo } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { detectURLType } from '../lib/urlDetection'
import { getDemoById } from '../config/demoContent'
import { isYouTubeApiAvailable } from '../lib/youtubeApi'
import { recordWatched } from '../lib/catchupStore'
import { currentYoutubeTime } from '../lib/floatingVideo'
import type { FramedSource } from '../lib/floatingVideo'
import { useRelatedVideos } from '../hooks/useRelatedVideos'
import { useVideoComments } from '../hooks/useVideoComments'
import { useVideoContext } from '../hooks/useVideoContext'
import { useVideoPage } from '../hooks/useVideoPage'
import FloatingPanel from '../components/chat/FloatingPanel'
import { useFloatingPageSource, useFloatingVideo } from '../components/chat/floatingVideoContext'
import VideoPopoutBar from '../components/chat/VideoPopoutBar'
import PlayerHost from '../components/player/PlayerHost'
import DebugPanel from '../components/layout/DebugPanel'
import CommentsSection from '../components/youtube/CommentsSection'
import ContextStrip from '../components/youtube/ContextStrip'
import DescriptionBlock from '../components/youtube/DescriptionBlock'
import RelatedTopics from '../components/youtube/RelatedTopics'
import RelatedVideos from '../components/youtube/RelatedVideos'
import VideoMeta from '../components/youtube/VideoMeta'

const MAX_TOPICS = 12

/** Topic buttons: the video's topics, then its tags, each once (case-insensitive). */
function mergeTopics(topics: string[], tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of [...topics, ...tags]) {
    const key = t.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(t.trim())
    if (out.length === MAX_TOPICS) break
  }
  return out
}

export default function YoutubePlayerPage() {
  const { videoId = '' } = useParams<{ videoId: string }>()
  const { search } = useLocation()
  const { state, dispatch } = useApp()
  const { player } = state

  // Set the player URL from the route param, and start at the top: moving between videos reuses this page.
  useEffect(() => {
    if (!videoId) return
    window.scrollTo(0, 0)
    recordWatched(videoId)
    const demo = getDemoById(videoId)
    const url = demo ? demo.url : `https://www.youtube.com/watch?v=${videoId}`
    const detection = detectURLType(url)
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The pop-out follows this page: it opens on this video and switches when the page moves to another one.
  const video = useFloatingVideo()
  const floatSource = useMemo<FramedSource | null>(() => (videoId ? { kind: 'youtube', videoId } : null), [videoId])
  useFloatingPageSource(floatSource)

  const { data } = useVideoPage(videoId)
  const { result: comments } = useVideoComments(videoId)
  const context = useVideoContext(videoId, search)
  const related = useRelatedVideos(videoId)
  const topics = useMemo(() => mergeTopics(data?.topics ?? [], data?.tags ?? []), [data])

  return (
    <div className="flex flex-col gap-5 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8">
      {/* Player */}
      <div
        className="w-full aspect-video rounded-lg overflow-hidden relative"
        style={{
          backgroundColor: '#000',
          border: '2px solid var(--accent-youtube)',
          boxShadow: '0 0 20px rgba(255, 0, 0, 0.1)',
        }}
      >
        {video.isFloating ? (
          <FloatingPanel onBringBack={video.close} />
        ) : player.currentUrl && player.detection ? (
          <PlayerHost url={player.currentUrl} detection={player.detection} />
        ) : (
          <div className="flex items-center justify-center w-full h-full" style={{ color: 'var(--text-muted)' }}>
            <div className="flex flex-col items-center gap-2">
              <Tv size={32} />
              <span className="text-sm">Loading video...</span>
            </div>
          </div>
        )}
      </div>

      <VideoPopoutBar getStartSec={currentYoutubeTime} />

      <ContextStrip source={context.source} status={context.status} strip={context.strip} currentId={videoId} />

      {/* The keys give each video fresh component state: folded tags and description, no old topic results. */}
      <VideoMeta key={videoId} data={data} />
      <DescriptionBlock key={videoId} text={data?.description ?? ''} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CommentsSection videoId={videoId} result={comments} />
        <RelatedVideos videos={related.videos} status={related.status} />
      </div>

      <RelatedTopics key={videoId} topics={topics} apiAvailable={isYouTubeApiAvailable()} />

      <DebugPanel />
    </div>
  )
}
