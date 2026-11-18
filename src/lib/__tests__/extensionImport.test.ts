import { describe, expect, it } from 'vitest'
import { parseImportFragment } from '../extensionImport'

const vid = (n: number) => `video${String(n).padStart(6, '0')}`

describe('parseImportFragment', () => {
  it('reads Watch Later ids, with or without the leading #', () => {
    expect(parseImportFragment('#v=1&kind=watch-later&ids=dQw4w9WgXcQ,jNQXAC9IVRw')).toEqual({
      kind: 'watch-later',
      ids: ['dQw4w9WgXcQ', 'jNQXAC9IVRw'],
    })
    expect(parseImportFragment('v=1&kind=watch-later&ids=dQw4w9WgXcQ')).toEqual({ kind: 'watch-later', ids: ['dQw4w9WgXcQ'] })
  })

  it('reads Twitch recommended channels', () => {
    expect(parseImportFragment('#v=1&kind=twitch-recommended&logins=ogre_jpg,zedxyr')).toEqual({
      kind: 'twitch-recommended',
      logins: ['ogre_jpg', 'zedxyr'],
    })
  })

  it('does not trust the sender: bad entries and repeats are dropped', () => {
    expect(parseImportFragment('#v=1&kind=watch-later&ids=dQw4w9WgXcQ,<script>,dQw4w9WgXcQ,short')).toEqual({
      kind: 'watch-later',
      ids: ['dQw4w9WgXcQ'],
    })
    expect(parseImportFragment('#v=1&kind=twitch-recommended&logins=ok_name,Bad Name,../x,A')).toEqual({
      kind: 'twitch-recommended',
      logins: ['ok_name'],
    })
  })

  it('caps the size of what it accepts', () => {
    const many = Array.from({ length: 2500 }, (_, i) => vid(i)).join(',')
    const parsed = parseImportFragment(`#v=1&kind=watch-later&ids=${many}`)
    expect(parsed && 'ids' in parsed && parsed.ids).toHaveLength(2000)
    const logins = Array.from({ length: 80 }, (_, i) => `chan${i}`).join(',')
    const t = parseImportFragment(`#v=1&kind=twitch-recommended&logins=${logins}`)
    expect(t && 'logins' in t && t.logins).toHaveLength(60)
  })

  it('returns null for anything it does not understand', () => {
    expect(parseImportFragment('')).toBeNull()
    expect(parseImportFragment('#')).toBeNull()
    expect(parseImportFragment('#v=2&kind=watch-later&ids=dQw4w9WgXcQ')).toBeNull()
    expect(parseImportFragment('#v=1&kind=other&ids=dQw4w9WgXcQ')).toBeNull()
    expect(parseImportFragment('#v=1&kind=watch-later')).toBeNull()
    expect(parseImportFragment('#v=1&kind=watch-later&ids=nothing,valid')).toBeNull()
  })
})
