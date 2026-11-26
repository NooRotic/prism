import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReportLiveSighting } from '../hooks/useReportLiveSighting'
import { useLocation, useParams } from 'react-router-dom'
import { Tv } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { detectURLType } from '../lib/urlDetection'
import { getDemoById } from '../config/demoContent'
import { trackEvent } from '../lib/analytics'
import { isYouTubeApiAvailable } from '../lib/youtubeApi'
import { recordWatched } from '../lib/catchupStore'
import { currentYoutubeTime } from '../lib/floatingVideo'
import type { FramedSource } from '../lib/floatingVideo'
import { useRelatedVideos } from '../hooks/useRelatedVideos'
import { useStayed } from '../hooks/useStayed'
import { useVideoComments } from '../hooks/useVideoComments'
import { useVideoContext } from '../hooks/useVideoContext'
import { useVideoPage } from '../hooks/useVideoPage'
import FloatingPanel from '../components/chat/FloatingPanel'
import ChatDock from '../components/chat/ChatDock'
import { encodeTarget } from '../lib/youtubeChatTarget'
import { useFloatingPageSource, useFloatingVideo } from '../components/chat/floatingVideoContext'
import VideoPopoutBar from '../components/chat/VideoPopoutBar'
import PlayerHost from '../components/player/PlayerHost'
import DebugPanel from '../components/layout/DebugPanel'
import CommentsSection from '../components/youtube/CommentsSection'
import ContextStrip from '../components/youtube/ContextStrip'
import DescriptionBlock from '../components/youtube/DescriptionBlock'
import QuotaNotice from '../components/youtube/QuotaNotice'
import RelatedByTopic from '../components/youtube/RelatedByTopic'
import RelatedTopics from '../components/youtube/RelatedTopics'
import RelatedVideos from '../components/youtube/RelatedVideos'
import TopicVideos from '../components/youtube/TopicVideos'
import VideoMeta, { VideoTitle } from '../components/youtube/VideoMeta'

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

/** The address the player plays for this page: a demo's own address, else the YouTube watch address. */
function playUrlFor(videoId: string): string {
  const demo = getDemoById(videoId)
  return demo ? demo.url : `https://www.youtube.com/watch?v=${videoId}`
}

/** How long the player waits for the video details (which say whether it is live) before starting anyway. */
const DETAILS_WAIT_MS = 4000

export default function YoutubePlayerPage() {
  const { videoId = '' } = useParams<{ videoId: string }>()
  const { search } = useLocation()
  const { state, dispatch } = useApp()
  const { player } = state

  // Set the player URL from the route param, and start at the top: moving between videos reuses this page.
  // The effect runs after the first render, so until the app holds this video's address (below) the player is not
  // shown: on arrival from a Twitch page it would otherwise start the leftover Twitch channel and fail on it.
  useEffect(() => {
    if (!videoId) return
    window.scrollTo(0, 0)
    recordWatched(videoId)
    const url = playUrlFor(videoId)
    const detection = detectURLType(url)
    if (state.player.currentUrl !== url) {
      dispatch({ type: 'PLAY_URL', url, detection })
    }
  }, [videoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The pop-out follows this page: it opens on this video and switches when the page moves to another one.
  const video = useFloatingVideo()
  const floatSource = useMemo<FramedSource | null>(() => (videoId ? { kind: 'youtube', videoId } : null), [videoId])
  useFloatingPageSource(floatSource)

  const { data, status: pageStatus } = useVideoPage(videoId)
  useReportLiveSighting(data)

  // What the owner's Matomo is told: whose video it is (known once the details arrive), once per video, and how long people
  // stay. The channel's id tells apart two channels of the same name.
  const channelName = data ? (data.channelId ? `${data.channelTitle} (${data.channelId})` : data.channelTitle) : null
  const reportedVideo = useRef<string | null>(null)
  useEffect(() => {
    if (channelName === null || reportedVideo.current === videoId) return
    reportedVideo.current = videoId
    trackEvent('YouTube', 'opened', channelName)
  }, [channelName, videoId])
  useStayed(channelName, video.isFloating)

  const { result: comments } = useVideoComments(videoId)
  const context = useVideoContext(videoId, search)
  const related = useRelatedVideos(videoId)
  const topics = useMemo(() => mergeTopics(data?.topics ?? [], data?.tags ?? []), [data])
  // No Mix videos: the column offers the first topic's videos (a search, so only with a key and only on a click).
  const apiAvailable = isYouTubeApiAvailable()
  const fallbackTopic = related.status === 'empty' && apiAvailable ? topics[0] : undefined

  // A tag or topic click puts that topic's videos in the player's place; "Replay video" brings the player back.
  // Remembered with the video id, so moving to another video starts on the player again.
  const [picked, setPicked] = useState<{ videoId: string; topic: string } | null>(null)
  const openTopic = apiAvailable ? (topic: string) => { setPicked({ videoId, topic }); window.scrollTo(0, 0) } : undefined
  const replay = useCallback(() => setPicked(null), [])
  const activeTopic = picked?.videoId === videoId ? picked.topic : null

  const title = <VideoTitle data={data} unavailable={pageStatus === 'unavailable'} />

  // Everything under the player, the same for both layouts.
  const below = (
    <>
      <QuotaNotice />

      <ContextStrip source={context.source} status={context.status} strip={context.strip} currentId={videoId} />

      {/* Left: channel, tags, description, comments. Right: related videos, from the title down.
          The keys give each video fresh component state: folded tags and description. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-5 min-w-0">
          <VideoMeta key={videoId} data={data} showTitle={false} onTopic={openTopic} />
          <DescriptionBlock key={videoId} text={data?.description ?? ''} />
          <CommentsSection videoId={videoId} result={comments} />
        </div>
        {fallbackTopic ? <RelatedByTopic key={`${videoId}:${fallbackTopic}`} topic={fallbackTopic} /> : <RelatedVideos videos={related.videos} status={related.status} />}
      </div>

      <RelatedTopics key={videoId} topics={topics} apiAvailable={apiAvailable} onPick={openTopic} />

      <DebugPanel />
    </>
  )

  // A live video gets its chat in the Twitch page's dock. The layout is settled before the player mounts (the details
  // say whether it is live), so the player never moves in the tree and never restarts when the chat appears.
  // Details that never come (a stalled request) must not hold the video back: after DETAILS_WAIT_MS the player starts
  // in the ordinary layout, and that visit keeps it even if "live" arrives later (moving the player would restart it).
  const [waitedOut, setWaitedOut] = useState<string | null>(null)
  useEffect(() => {
    if (pageStatus !== 'loading') return
    const id = setTimeout(() => setWaitedOut(videoId), DETAILS_WAIT_MS)
    return () => clearTimeout(id)
  }, [pageStatus, videoId])
  const gaveUp = waitedOut === videoId
  const isLive = data?.live.state === 'live' && !gaveUp
  const detailsKnown = pageStatus !== 'loading' || gaveUp
  const chatTarget = isLive
    ? encodeTarget({ kind: 'video', videoId, ...(data?.channelId ? { channelId: data.channelId } : {}) })
    : ''
  const holdsThisVideo = player.currentUrl && player.detection && player.currentUrl === playUrlFor(videoId)
  const playerOrLoading =
    detailsKnown && holdsThisVideo && player.currentUrl && player.detection ? (
      <PlayerHost url={player.currentUrl} detection={player.detection} />
    ) : (
      <div className="flex items-center justify-center w-full h-full" style={{ color: 'var(--text-muted)' }}>
        <div className="flex flex-col items-center gap-2">
          <Tv size={32} />
          <span className="text-sm">Loading video...</span>
        </div>
      </div>
    )

  if (isLive) {
    return (
      <div className="flex flex-col gap-5 w-full pt-4 pb-8">
        <div className="w-full px-4 md:px-6 lg:px-8 flex flex-col gap-3">
          <div className="fill-hide w-full max-w-[1600px] mx-auto">{title}</div>
          {/* The dock draws the floating-window panel itself, as on the Twitch page. */}
          <ChatDock
            kind="youtube"
            channel={chatTarget}
            player={activeTopic ? <TopicVideos key={activeTopic} topic={activeTopic} onReplay={replay} /> : playerOrLoading}
          />
        </div>
        {/* Hidden (not unmounted) while the dock fills the window, so nothing scrolls or takes focus behind it. */}
        <div className="fill-hide flex flex-col gap-5 w-full max-w-5xl mx-auto px-4 md:px-6">{below}</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8">
      {/* One row above the player: the title, and the pop-out button at its right. */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">{title}</div>
        {!activeTopic && <VideoPopoutBar getStartSec={currentYoutubeTime} />}
      </div>
      {activeTopic ? (
        <TopicVideos key={activeTopic} topic={activeTopic} onReplay={replay} />
      ) : (
      /* Player */
      <div
        className="w-full aspect-video rounded-lg overflow-hidden relative"
        style={{
          backgroundColor: '#000',
          border: '2px solid var(--accent-youtube)',
          boxShadow: '0 0 20px rgba(255, 0, 0, 0.1)',
        }}
      >
        {video.isFloating ? <FloatingPanel onBringBack={video.close} /> : playerOrLoading}
      </div>
      )}

      {below}
    </div>
  )
}
