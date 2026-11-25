import { getDemoById } from '../config/demoContent'
import { CUSTOM_STREAM_ID } from './routes'
import { normalisePath } from './usageApi'

export interface AnalyticsPage {
  path: string
  title: string
}

const LOGIN = /^[A-Za-z0-9_]{1,25}$/
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const STREAM_ID = /^[0-9a-f]{12}$/

/** The admin pages are the owner's tool; the pop-outs are parts of a page that is already counted. */
const NOT_COUNTED = /^\/(admin(\/.*)?|chat\/.*|chat-youtube\/.*|popout\/player)$/

const isDemo = (id: string, ...protocols: string[]): boolean => {
  const demo = getDemoById(id)
  return demo !== undefined && protocols.includes(demo.protocol)
}

/**
 * The address and title a page is counted under, or null when it is not counted. An allow-list by shape: a path can hold
 * anything a visitor pasted (the paste box opens `/youtube/<the whole address>` when it finds no video id), so one that fits
 * no pattern is sent as its section's "other", or as not found, and never as it is.
 */
export function analyticsPage(pathname: string): AnalyticsPage | null {
  const path = normalisePath(pathname)
  if (NOT_COUNTED.test(path)) return null
  if (path === '/') return { path, title: 'Home' }
  if (path === '/import') return { path, title: 'Import' }

  const [, section, id, ...rest] = path.split('/')
  if (rest.length > 0) return { path: '/not-found', title: 'Not found' }

  switch (section) {
    case 'twitch':
      if (id === undefined) return { path, title: 'Twitch' }
      return LOGIN.test(id) ? { path: path.toLowerCase(), title: 'Twitch channel' } : { path: '/twitch/other', title: 'Twitch: other' }
    case 'youtube':
      if (id === undefined) return { path, title: 'YouTube' }
      if (id === 'catchup') return { path, title: 'YouTube: Catch up' }
      return YOUTUBE_ID.test(id) || isDemo(id, 'youtube') ? { path, title: 'YouTube video' } : { path: '/youtube/other', title: 'YouTube: other' }
    case 'hls-dash':
      if (id === undefined) return { path, title: 'HLS / DASH' }
      if (id === CUSTOM_STREAM_ID) return { path, title: 'HLS / DASH: pasted address' }
      return STREAM_ID.test(id) || isDemo(id, 'hls', 'dash') ? { path, title: 'HLS / DASH stream' } : { path: '/hls-dash/other', title: 'HLS / DASH: other' }
    default:
      return { path: '/not-found', title: 'Not found' }
  }
}

const CAMPAIGN_TAGS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']

/** The campaign tags of a query string, as a query string of their own; everything else in it stays here. */
export function campaignQuery(search: string): string {
  const given = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const tag of CAMPAIGN_TAGS) {
    const value = given.get(tag)
    if (value) kept.set(tag, value)
  }
  const text = kept.toString()
  return text === '' ? '' : `?${text}`
}
