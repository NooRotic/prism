import videojs from 'video.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { avoidFormat, installRenditionGuard, isRenditionGuardInstalled, resetAvoidedFormats } from '../renditionGuard'

// The rendition guard wraps selectors of the REAL Video.js (the unit tests use a stand-in): if a Video.js upgrade renames or
// moves them, these fail instead of the guard silently doing nothing.

interface FakePlaylist {
  id: string
  disabled?: boolean
  attributes: { CODECS: string; BANDWIDTH: number; RESOLUTION: { width: number; height: number } }
}

const playlist = (id: string, CODECS: string, BANDWIDTH: number, width: number, height: number): FakePlaylist => ({
  id,
  attributes: { CODECS, BANDWIDTH, RESOLUTION: { width, height } },
})

function mainManifest() {
  return {
    // The HEVC rendition is the cheaper one: with nothing avoided Video.js's first pick is the HEVC one.
    playlists: [playlist('0-hevc', 'hvc1.2.4,mp4a.40.2', 500_000, 640, 360), playlist('1-avc', 'avc1.64001f,mp4a.40.2', 900_000, 640, 360)],
    mediaGroups: { AUDIO: {}, VIDEO: {}, 'CLOSED-CAPTIONS': {}, SUBTITLES: {} },
  }
}

type Selector = (this: unknown) => { id: string } | null
const vhs = () => (videojs as unknown as { Vhs: Record<'INITIAL_PLAYLIST_SELECTOR' | 'STANDARD_PLAYLIST_SELECTOR', Selector> }).Vhs

beforeEach(() => resetAvoidedFormats())

describe('the rendition guard on the real Video.js', () => {
  it('finds the selectors it wraps', () => {
    expect(typeof vhs().INITIAL_PLAYLIST_SELECTOR).toBe('function')
    expect(typeof vhs().STANDARD_PLAYLIST_SELECTOR).toBe('function')
    expect(installRenditionGuard(videojs)).toBe(true)
    expect(isRenditionGuardInstalled()).toBe(true)
  })

  it('makes the first pick skip an avoided format, though that rendition is the cheaper one', () => {
    installRenditionGuard(videojs)
    const main = mainManifest()
    const handler = { playlists: { main } }
    expect(vhs().INITIAL_PLAYLIST_SELECTOR.call(handler)?.id).toBe('0-hevc')

    avoidFormat('hevc')
    const second = mainManifest()

    expect(vhs().INITIAL_PLAYLIST_SELECTOR.call({ playlists: { main: second } })?.id).toBe('1-avc')
    expect(second.playlists[0].disabled).toBe(true)
    expect(second.playlists[1].disabled).toBeUndefined()
  })

  it('makes the later picks skip it too', () => {
    installRenditionGuard(videojs)
    avoidFormat('hevc')
    const main = mainManifest()
    const handler = {
      playlists: { main },
      systemBandwidth: 50_000_000,
      useDevicePixelRatio: false,
      customPixelRatio: NaN,
      usePlayerObjectFit: false,
      limitRenditionByPlayerDimensions: false,
      tech_: { el: () => document.createElement('div') },
    }

    const picked = vhs().STANDARD_PLAYLIST_SELECTOR.call(handler)

    expect(picked?.id).toBe('1-avc')
  })
})
