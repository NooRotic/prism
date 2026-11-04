import TwitchChatEmbed from '../channel/TwitchChatEmbed'

interface ChatSourceProps {
  channel: string
}

/**
 * The only place that decides what chat is shown. Today it is the channel's
 * Twitch chat; Kick, YouTube or a combined feed can replace it later without
 * touching the dock or the pop-out window.
 */
export default function ChatSource({ channel }: ChatSourceProps) {
  return <TwitchChatEmbed channel={channel} />
}
