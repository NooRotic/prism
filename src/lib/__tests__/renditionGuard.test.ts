import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlaybackSnapshot } from '../playbackLog'
import {
  MAX_RECOVERIES,
  avoidFormat,
  avoidedFormats,
  installRenditionGuard,
  markAvoidedRenditions,
  planDecodeRecovery,
  resetAvoidedFormats,
  videoFamily,
} from '../renditionGuard'

beforeEach(() => resetAvoidedFormats())

describe('videoFamily', () => {
  it.each([
    ['avc1.64001f,mp4a.40.2', 'avc'],
    ['avc3.64001f', 'avc'],
    ['mp4a.40.2,hvc1.2.20000000.L123.B0', 'hevc'],
    ['hev1.1.6.L93.B0', 'hevc'],
    ['dvh1.05.06,ec-3', 'dolby-vision'],
    ['dvhe.05.06', 'dolby-vision'],
    ['av01.0.05M.08', 'av1'],
    ['vp09.00.10.08', 'vp9'],
    ['vp9', 'vp9'],
    [' avc1.64001f , mp4a.40.5 ', 'avc'],
    ['mp4a.40.2', null],
    ['', null],
    [undefined, null],
  ])('%s is %s', (codecs, expected) => {
    expect(videoFamily(codecs)).toBe(expected)
  })
})

describe('the avoided formats', () => {
  it('keeps each format once, tells the playback log, and can be reset', () => {
    avoidFormat('hevc')
    avoidFormat('hevc')
    avoidFormat('av1')

    expect(avoidedFormats()).toEqual(['hevc', 'av1'])
    expect(getPlaybackSnapshot().avoided).toEqual(['hevc', 'av1'])

    resetAvoidedFormats()
    expect(avoidedFormats()).toEqual([])
    expect(getPlaybackSnapshot().avoided).toEqual([])
  })
})

describe('markAvoidedRenditions', () => {
  const rendition = (CODECS?: string) => (CODECS === undefined ? {} : { attributes: { CODECS } })

  it('turns off only the renditions of an avoided format, and says how many', () => {
    const list: Array<{ attributes?: { CODECS?: string }; disabled?: boolean }> = [
      rendition('avc1.64001f,mp4a.40.2'),
      rendition('hvc1.2.4,mp4a.40.2'),
      rendition('dvh1.05.06,ec-3'),
      rendition(),
    ]
    avoidFormat('hevc')

    expect(markAvoidedRenditions(list)).toBe(1)

    expect(list.map((item) => item.disabled)).toEqual([undefined, true, undefined, undefined])
  })

  it('marks nothing when every rendition that is still on would be turned off', () => {
    const list: Array<{ attributes?: { CODECS?: string }; disabled?: boolean }> = [rendition('hvc1.2.4,mp4a.40.2'), rendition('hev1.1.6,mp4a.40.2')]
    avoidFormat('hevc')

    expect(markAvoidedRenditions(list)).toBe(0)

    expect(list.every((item) => item.disabled === undefined)).toBe(true)
  })

  it('does not count a rendition that was already off as one that is still available', () => {
    const list: Array<{ attributes?: { CODECS?: string }; disabled?: boolean }> = [
      { ...rendition('avc1.64001f,mp4a.40.2'), disabled: true },
      rendition('hvc1.2.4,mp4a.40.2'),
    ]
    avoidFormat('hevc')

    expect(markAvoidedRenditions(list)).toBe(0)
    expect(list[1].disabled).toBeUndefined()
  })

  it('does nothing when no format is avoided, and copes with no list', () => {
    const list = [rendition('hvc1.2.4,mp4a.40.2')]

    expect(markAvoidedRenditions(list)).toBe(0)
    expect(markAvoidedRenditions(undefined)).toBe(0)
  })
})

describe('planDecodeRecovery', () => {
  const base = { code: 3, attempts: 0, failingCodecs: 'hvc1.2.4,mp4a.40.2', playlistCodecs: ['avc1.64001f,mp4a.40.2', 'hvc1.2.4,mp4a.40.2'] }

  it('asks for a retry that avoids the failing format when another format is on offer', () => {
    expect(planDecodeRecovery(base)).toEqual({ retry: true, family: 'hevc' })
  })

  it('can step from Dolby Vision to HEVC', () => {
    expect(planDecodeRecovery({ ...base, failingCodecs: 'dvh1.05.06,ec-3', playlistCodecs: ['dvh1.05.06,ec-3', 'hvc1.2.4,mp4a.40.2'] })).toEqual({
      retry: true,
      family: 'dolby-vision',
    })
  })

  it.each([
    ['another kind of error', { ...base, code: 4 }],
    ['no error code', { ...base, code: undefined }],
    ['the recoveries are used up', { ...base, attempts: MAX_RECOVERIES }],
    ['the failing rendition names no codec', { ...base, failingCodecs: undefined }],
    ['the failing rendition has no video format', { ...base, failingCodecs: 'mp4a.40.2' }],
    ['H.264 itself failed', { ...base, failingCodecs: 'avc1.64001f,mp4a.40.2' }],
    ['the stream offers only the failing format', { ...base, playlistCodecs: ['hvc1.2.4,mp4a.40.2', 'hev1.1.6,mp4a.40.2'] }],
    ['the other renditions are of no known format', { ...base, playlistCodecs: ['hvc1.2.4,mp4a.40.2', undefined, 'mp4a.40.2'] }],
  ])('does not retry when %s', (_label, input) => {
    const plan = planDecodeRecovery(input)

    expect(plan.retry).toBe(false)
    expect(plan.retry === false && plan.reason.length > 0).toBe(true)
  })

  it('does not retry a format that is already avoided, nor onto one that is', () => {
    avoidFormat('hevc')
    expect(planDecodeRecovery(base).retry).toBe(false)

    expect(planDecodeRecovery({ ...base, failingCodecs: 'dvh1.05.06,ec-3', playlistCodecs: ['dvh1.05.06,ec-3', 'hvc1.2.4,mp4a.40.2'] }).retry).toBe(false)
  })
})

describe('installRenditionGuard', () => {
  function fakeVhs() {
    const standard = vi.fn(function (this: unknown) {
      return { picked: this }
    })
    const initial = vi.fn(function () {
      return 'initial'
    })
    return { standard, initial, vjs: { Vhs: { STANDARD_PLAYLIST_SELECTOR: standard, INITIAL_PLAYLIST_SELECTOR: initial } } }
  }
  const handler = () => ({
    playlists: { main: { playlists: [{ attributes: { CODECS: 'avc1.64001f,mp4a.40.2' } }, { attributes: { CODECS: 'hvc1.2.4,mp4a.40.2' } }] as Array<{ attributes: { CODECS: string }; disabled?: boolean }> } },
  })

  it('wraps both selectors so avoided renditions are off before Video.js picks, and the original still runs with the same this and arguments', () => {
    const { standard, initial, vjs } = fakeVhs()
    expect(installRenditionGuard(vjs)).toBe(true)
    avoidFormat('hevc')

    const self = handler()
    const picked = (vjs.Vhs.STANDARD_PLAYLIST_SELECTOR as (...args: unknown[]) => unknown).call(self, 'arg')
    const self2 = handler()
    const first = (vjs.Vhs.INITIAL_PLAYLIST_SELECTOR as () => unknown).call(self2)

    expect(picked).toEqual({ picked: self })
    expect(standard).toHaveBeenCalledTimes(1)
    expect(standard.mock.calls[0]).toEqual(['arg'])
    expect(first).toBe('initial')
    expect(initial).toHaveBeenCalledTimes(1)
    expect(self.playlists.main.playlists.map((p) => p.disabled)).toEqual([undefined, true])
    expect(self2.playlists.main.playlists.map((p) => p.disabled)).toEqual([undefined, true])
  })

  it('wraps only once, however often it is called', () => {
    const { vjs } = fakeVhs()
    let reads = 0
    const self = {
      playlists: {
        main: {
          get playlists() {
            reads++
            return [{ attributes: { CODECS: 'avc1.64001f,mp4a.40.2' } }]
          },
        },
      },
    }

    expect(installRenditionGuard(vjs)).toBe(true)
    expect(installRenditionGuard(vjs)).toBe(true)
    ;(vjs.Vhs.STANDARD_PLAYLIST_SELECTOR as () => unknown).call(self)

    expect(reads).toBe(1)
  })

  it('does nothing, and says so, when there is no Vhs to wrap', () => {
    expect(installRenditionGuard({})).toBe(false)
    expect(installRenditionGuard(undefined)).toBe(false)
    expect(installRenditionGuard({ Vhs: {} })).toBe(false)
  })

  it('still picks when the handler has no playlists to look at', () => {
    const { standard, vjs } = fakeVhs()
    installRenditionGuard(vjs)

    expect(() => (vjs.Vhs.STANDARD_PLAYLIST_SELECTOR as () => unknown).call({})).not.toThrow()
    expect(standard).toHaveBeenCalledTimes(1)
  })
})
