interface TwitchChatEmbedProps {
  channel: string
}

export default function TwitchChatEmbed({ channel }: TwitchChatEmbedProps) {
  const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

  return (
    <iframe
      src={`https://www.twitch.tv/embed/${channel}/chat?parent=${parent}&darkpopout`}
      className="w-full h-full border-0"
      title={`${channel} Twitch chat`}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
    />
  )
}
