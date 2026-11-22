import { youtubeChatEmbedUrl } from '../../lib/youtubeChatTarget'

/** YouTube's own live chat for one video. Posting works when the viewer is signed in to YouTube in this browser. */
export default function YoutubeChatEmbed({ videoId }: { videoId: string }) {
  return (
    <iframe
      title="YouTube live chat"
      src={youtubeChatEmbedUrl(videoId, window.location.hostname)}
      className="h-full w-full border-0"
    />
  )
}
