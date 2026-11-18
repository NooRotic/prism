import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { parseImportFragment } from '../extensionImport'

// The extension's own script is a classic (non-module) file so Chrome can load it as a content script;
// the tests load it the same way, which also pins the format PRISM has to understand.
const handoff = createRequire(import.meta.url)('../../../extension/handoff.js') as {
  buildFragment(kind: string, items: string[]): string | null
  importUrl(kind: string, items: string[], dev?: boolean): string | null
  isPrismImportUrl(url: string): boolean
  ORIGINS: { prod: string; dev: string }
}

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
