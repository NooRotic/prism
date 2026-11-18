import { PROTOCOL_META } from '../config/demoContent'

/** The three parts of PRISM the header links to. */
export type SectionId = 'twitch' | 'youtube' | 'hls-dash'

export interface SectionDef {
  id: SectionId
  path: string
  label: string
  /** What the tab reads below 640 px. */
  shortLabel: string
  color: string
  /** Whether the tab has a row of tools under the bar (a ▾ button). */
  hasTools: boolean
}

export const SECTIONS: readonly SectionDef[] = [
  { id: 'twitch', path: '/twitch', label: 'Twitch', shortLabel: 'Twitch', color: PROTOCOL_META.twitch.color, hasTools: true },
  { id: 'youtube', path: '/youtube', label: 'YouTube', shortLabel: 'YouTube', color: PROTOCOL_META.youtube.color, hasTools: true },
  { id: 'hls-dash', path: '/hls-dash', label: 'HLS/DASH', shortLabel: 'HLS', color: PROTOCOL_META['hls-dash'].color, hasTools: false },
]

const SECTION_PATH = /^\/(twitch|youtube|hls-dash)(\/|$)/

/** Which section a page is in, or null (the hub, the not-found page). */
export function sectionForPath(pathname: string): SectionId | null {
  const match = SECTION_PATH.exec(pathname)
  return match ? (match[1] as SectionId) : null
}

/** The hub and the Twitch and YouTube listings have a paste box of their own; every other page gets the header's. */
export function showsHeaderPaste(pathname: string): boolean {
  return !['/', '/twitch', '/youtube'].includes(pathname)
}
