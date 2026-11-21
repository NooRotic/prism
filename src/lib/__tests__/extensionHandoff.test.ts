import { describe, expect, it } from 'vitest'
import { parseImportFragment } from '../extensionImport'
import handoffSource from '../../../extension/handoff.js?raw'

interface Handoff {
  buildFragment(kind: string, items: string[]): string | null
  importUrl(kind: string, items: string[], dev?: boolean): string | null
  isPrismImportUrl(url: string): boolean
  playPath(url: string): string | null
  playUrl(url: string, dev?: boolean): string | null
  isPrismOpenUrl(url: string): boolean
  ORIGINS: { prod: string; dev: string }
}

// The extension's own script is a classic (non-module) file so Chrome can load it as a content script. The tests
// run its source as one too, which also pins the format PRISM has to understand.
const mod = { exports: {} as Handoff }
new Function('module', handoffSource)(mod)
const handoff = mod.exports

const id = (n: number) => `video${String(n).padStart(6, '0')}`

describe('extension hand-off: building the address', () => {
  it('puts Watch Later ids in the fragment', () => {
    expect(handoff.buildFragment('watch-later', ['dQw4w9WgXcQ', 'jNQXAC9IVRw'])).toBe(
      '#v=1&kind=watch-later&ids=dQw4w9WgXcQ,jNQXAC9IVRw',
    )
  })

  it('puts Twitch channel logins in the fragment, lower-cased', () => {
    expect(handoff.buildFragment('twitch-recommended', ['Ogre_JPG', 'zedxyr'])).toBe(
      '#v=1&kind=twitch-recommended&logins=ogre_jpg,zedxyr',
    )
  })

  it('drops anything that is not an id or a login, and repeats', () => {
    expect(handoff.buildFragment('watch-later', ['dQw4w9WgXcQ', 'nope', 'dQw4w9WgXcQ', 'has space 1', ''])).toBe(
      '#v=1&kind=watch-later&ids=dQw4w9WgXcQ',
    )
    expect(handoff.buildFragment('twitch-recommended', ['ok_name', 'a', 'bad name', 'directory/x'])).toBe(
      '#v=1&kind=twitch-recommended&logins=ok_name',
    )
  })

  it('has nothing to send when no item is valid, or the kind is unknown', () => {
    expect(handoff.buildFragment('watch-later', ['nope'])).toBeNull()
    expect(handoff.buildFragment('something-else', ['dQw4w9WgXcQ'])).toBeNull()
  })

  it('opens the production site, or localhost when asked for the dev site', () => {
    expect(handoff.importUrl('watch-later', ['dQw4w9WgXcQ'])).toBe('https://prism.nooroticx.tv/import#v=1&kind=watch-later&ids=dQw4w9WgXcQ')
    expect(handoff.importUrl('watch-later', ['dQw4w9WgXcQ'], true)).toBe('http://localhost:5000/import#v=1&kind=watch-later&ids=dQw4w9WgXcQ')
    expect(handoff.importUrl('watch-later', ['nope'])).toBeNull()
  })
})

describe('extension hand-off: what PRISM reads back', () => {
  it('round-trips a Watch Later list', () => {
    const ids = Array.from({ length: 546 }, (_, i) => id(i))
    const frag = handoff.buildFragment('watch-later', ids)!
    expect(parseImportFragment(frag)).toEqual({ kind: 'watch-later', ids })
  })

  it('round-trips the Twitch recommended channels', () => {
    const frag = handoff.buildFragment('twitch-recommended', ['mercadomedia', 'ogre_jpg'])!
    expect(parseImportFragment(frag)).toEqual({ kind: 'twitch-recommended', logins: ['mercadomedia', 'ogre_jpg'] })
  })
})

describe('extension hand-off: which addresses the background worker may open', () => {
  it('opens only PRISM import addresses on the live site or localhost', () => {
    expect(handoff.isPrismImportUrl('https://prism.nooroticx.tv/import#v=1&kind=watch-later&ids=dQw4w9WgXcQ')).toBe(true)
    expect(handoff.isPrismImportUrl('http://localhost:5000/import#v=1')).toBe(true)
  })

  it('refuses look-alike hosts, other paths and other schemes', () => {
    expect(handoff.isPrismImportUrl('https://prism.nooroticx.tv.evil.example/import#v=1')).toBe(false)
    expect(handoff.isPrismImportUrl('https://evil.example/import#v=1')).toBe(false)
    expect(handoff.isPrismImportUrl('https://prism.nooroticx.tv/admin')).toBe(false)
    expect(handoff.isPrismImportUrl('http://prism.nooroticx.tv/import#v=1')).toBe(false)
    expect(handoff.isPrismImportUrl('javascript:alert(1)')).toBe(false)
    expect(handoff.isPrismImportUrl('not a url')).toBe(false)
  })
})

describe('extension hand-off: opening a page in PRISM', () => {
  const path = (url: string) => handoff.playPath(url)

  it('maps a YouTube video address, in every common shape, to /youtube/<id>', () => {
    expect(path('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('/youtube/dQw4w9WgXcQ')
    expect(path('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc&t=42s')).toBe('/youtube/dQw4w9WgXcQ')
    expect(path('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('/youtube/dQw4w9WgXcQ')
    expect(path('https://youtu.be/dQw4w9WgXcQ?si=x')).toBe('/youtube/dQw4w9WgXcQ')
    expect(path('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('/youtube/dQw4w9WgXcQ')
    expect(path('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('/youtube/dQw4w9WgXcQ')
    expect(path('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('/youtube/dQw4w9WgXcQ')
  })

  it('maps a Twitch channel address to /twitch/<login>, lower-cased', () => {
    expect(path('https://www.twitch.tv/Ogre_JPG')).toBe('/twitch/ogre_jpg')
    expect(path('https://twitch.tv/zedxyr/')).toBe('/twitch/zedxyr')
    expect(path('https://www.twitch.tv/zedxyr/videos?filter=all')).toBe('/twitch/zedxyr')
  })

  it('has nothing to open for Twitch pages that are not a channel, other sites and bad addresses', () => {
    for (const bad of [
      'https://www.twitch.tv/',
      'https://www.twitch.tv/directory/game/Just%20Chatting',
      'https://www.twitch.tv/videos/123456',
      'https://www.twitch.tv/settings/profile',
      'https://www.youtube.com/',
      'https://www.youtube.com/watch?v=short',
      'https://www.youtube.com/playlist?list=WL',
      'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://evil.example/twitch.tv/zedxyr',
      'https://example.com/',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(path(bad), bad).toBeNull()
    }
  })

  it('builds the full address on the live site, or on localhost for the dev site', () => {
    expect(handoff.playUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://prism.nooroticx.tv/youtube/dQw4w9WgXcQ')
    expect(handoff.playUrl('https://www.twitch.tv/zedxyr', true)).toBe('http://localhost:5000/twitch/zedxyr')
    expect(handoff.playUrl('https://example.com/')).toBeNull()
  })

  it('lets the background worker open only PRISM import and play addresses', () => {
    expect(handoff.isPrismOpenUrl('https://prism.nooroticx.tv/youtube/dQw4w9WgXcQ')).toBe(true)
    expect(handoff.isPrismOpenUrl('https://prism.nooroticx.tv/twitch/zedxyr')).toBe(true)
    expect(handoff.isPrismOpenUrl('https://prism.nooroticx.tv/import#v=1&kind=watch-later&ids=dQw4w9WgXcQ')).toBe(true)
    expect(handoff.isPrismOpenUrl('https://prism.nooroticx.tv/admin')).toBe(false)
    expect(handoff.isPrismOpenUrl('https://evil.example/youtube/dQw4w9WgXcQ')).toBe(false)
    expect(handoff.isPrismOpenUrl('https://prism.nooroticx.tv.evil.example/twitch/x')).toBe(false)
  })
})
