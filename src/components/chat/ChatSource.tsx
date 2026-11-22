import TwitchChatEmbed from '../channel/TwitchChatEmbed'
import YoutubeChatEmbed from './YoutubeChatEmbed'
import type { ChatKind } from '../../lib/chatPopout'
import { decodeTarget } from '../../lib/youtubeChatTarget'

interface ChatSourceProps {
  /** A Twitch login, or for YouTube the encoded target (see youtubeChatTarget). */
  channel: string
  kind?: ChatKind
}

function Notice({ text }: { text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
      <p>{text}</p>
      <button
        type="button"
        onClick={() => window.close()}
        className="rounded-md px-3 py-1 text-xs transition-colors hover:bg-white/5"
        style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}
      >
        Close
      </button>
    </div>
  )
}

/**
 * The only place that decides what chat is shown: the channel's Twitch chat, or a YouTube live chat (YouTube's own
 * embed) with plain words while the stream is being found or when there is none.
 */
export default function ChatSource({ channel, kind = 'twitch' }: ChatSourceProps) {
  if (kind === 'twitch') return <TwitchChatEmbed channel={channel} />
  const target = decodeTarget(channel)
  switch (target.kind) {
    case 'video':
      return <YoutubeChatEmbed videoId={target.videoId} />
    case 'looking':
      return (
        <div className="flex h-full items-center justify-center p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Looking for the YouTube stream…
        </div>
      )
    case 'none':
      return <Notice text={`${target.name} isn't live on YouTube right now`} />
    case 'failed':
      return (
        <Notice
          text={target.reason === 'quota' ? "PRISM has used up YouTube's daily limit; try again tomorrow." : "Couldn't reach YouTube."}
        />
      )
  }
}
