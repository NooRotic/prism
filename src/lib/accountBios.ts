/**
 * Does a creator's bio name their channel on the other platform? Two bios that name each other are the one thing PRISM
 * trusts without a person's say-so. Pure.
 */

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True when the text holds a twitch.tv address for exactly this channel (not a longer name). */
export function mentionsTwitch(text: string, login: string): boolean {
  if (!text || !login) return false
  return new RegExp(`twitch\\.tv/${escape(login)}(?![\\w])`, 'i').test(text)
}

/** True when the text holds a youtube.com address for this channel, by handle or by channel id. */
export function mentionsYoutube(text: string, channel: { channelId?: string; handle?: string }): boolean {
  if (!text) return false
  const handle = (channel.handle ?? '').replace(/^@/, '')
  if (handle && new RegExp(`youtube\\.com/@${escape(handle)}(?![\\w.-])`, 'i').test(text)) return true
  if (channel.channelId && new RegExp(`youtube\\.com/channel/${escape(channel.channelId)}`, 'i').test(text)) return true
  return false
}

export function isMutual(args: {
  twitchLogin: string
  twitchDescription: string
  youtube: { channelId?: string; handle?: string; description: string }
}): boolean {
  return mentionsYoutube(args.twitchDescription, args.youtube) && mentionsTwitch(args.youtube.description, args.twitchLogin)
}
