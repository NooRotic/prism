import { useCallback, useEffect, useState } from 'react'
import { isMutual } from '../lib/accountBios'
import { linkName, trackEvent } from '../lib/analytics'
import { dismissSuggestion, findByTwitch, isDismissed, saveLink } from '../lib/linkedAccounts'
import { isYouTubeApiAvailable } from '../lib/youtubeApi'
import { fetchYoutubeChannel, type YoutubeChannel } from '../lib/youtubeChannelApi'

export type SuggestionStatus = 'idle' | 'checking' | 'suggest' | 'none'

/**
 * For a Twitch channel with no link: is there a YouTube channel with the same name? One lookup (1 quota unit, remembered
 * for a day, including "none"). When both bios name each other it is linked at once as confirmed; otherwise the
 * same-name channel is only offered (`status: 'suggest'`), because a matching name is not proof. "Not them" is
 * remembered per channel.
 */
export function useLinkSuggestion(login: string, description: string) {
  const [status, setStatus] = useState<SuggestionStatus>('idle')
  const [channel, setChannel] = useState<YoutubeChannel | undefined>(undefined)

  useEffect(() => {
    let current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new channel starts with no suggestion
    setChannel(undefined)
    if (!login || login.length < 3 || findByTwitch(login) || isDismissed(login) || !isYouTubeApiAvailable()) {
      setStatus('idle')
      return
    }
    setStatus('checking')
    void (async () => {
      const result = await fetchYoutubeChannel({ handle: login })
      if (!current) return
      if (result.status !== 'ok') {
        setStatus('none')
        return
      }
      const c = result.channel
      if (isMutual({ twitchLogin: login, twitchDescription: description, youtube: { channelId: c.channelId, handle: c.handle, description: c.description } })) {
        saveLink({ twitch: login, youtube: { channelId: c.channelId, title: c.title, ...(c.handle ? { handle: c.handle } : {}) }, confirmed: true, linkedAt: Date.now() })
        // Nobody asked for this link, so it is counted apart from those people make.
        trackEvent('Linking', 'auto-linked', linkName({ twitch: login.toLowerCase(), youtube: c }))
        setStatus('idle')
        return
      }
      setChannel(c)
      setStatus('suggest')
    })()
    return () => {
      current = false
    }
  }, [login, description])

  const accept = useCallback(() => {
    if (!channel) return
    saveLink({ twitch: login, youtube: { channelId: channel.channelId, title: channel.title, ...(channel.handle ? { handle: channel.handle } : {}) }, confirmed: false, linkedAt: Date.now() })
    trackEvent('Linking', 'linked', linkName({ twitch: login.toLowerCase(), youtube: channel }))
    setStatus('idle')
  }, [channel, login])

  const dismiss = useCallback(() => {
    dismissSuggestion(login)
    setStatus('none')
  }, [login])

  return { status, channel, accept, dismiss }
}
