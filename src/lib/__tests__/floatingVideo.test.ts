import { detectURLType } from '../urlDetection'
import { STORAGE_KEYS } from '../../config/storageKeys'
import {
  canPopOutOn,
  clampFloatSize,
  floatingChannelFromPath,
  floatingShouldEnd,
  isFloatingSupported,
  loadFloatSize,
  saveFloatSize,
} from '../floatingVideo'

const live = detectURLType('https://twitch.tv/x')
const clip = detectURLType('https://clips.twitch.tv/AbcDef')
const vod = detectURLType('https://twitch.tv/videos/123')

const KEY = STORAGE_KEYS.LOCAL_VIDEO_POPOUT_SIZE

describe('the detections used below', () => {
  it('are the kinds the tests claim, so a wrong URL fails loudly', () => {
    expect(live.platform).toBe('twitch-stream')
    expect(clip.platform).toBe('twitch-clip')
    expect(vod.platform).toBe('twitch-video')
  })
})

describe('clampFloatSize', () => {
  it.each([
    [{ width: 300, height: 200 }, { width: 480, height: 270 }],
    [{ width: 800, height: 500 }, { width: 800, height: 500 }],
    [{ width: 300, height: 500 }, { width: 480, height: 500 }],
    [{ width: 900, height: 100 }, { width: 900, height: 270 }],
  ])('turns %j into %j', (input, expected) => {
    expect(clampFloatSize(input)).toEqual(expected)
  })
})

describe('clampFloatSize with a ceiling', () => {
  const screenArea = { width: 1920, height: 1080 }

  it.each([
    [{ width: 5000, height: 4000 }, { width: 1920, height: 1080 }],
    [{ width: 800, height: 500 }, { width: 800, height: 500 }],
    [{ width: 5000, height: 500 }, { width: 1920, height: 500 }],
    [{ width: 900, height: 4000 }, { width: 900, height: 1080 }],
  ])('turns %j into %j on a 1920x1080 screen', (input, expected) => {
    expect(clampFloatSize(input, screenArea)).toEqual(expected)
  })

  it('never goes under the floor, even on a screen smaller than it', () => {
    expect(clampFloatSize({ width: 5000, height: 5000 }, { width: 400, height: 200 })).toEqual({
      width: 480,
      height: 270,
    })
  })
})

describe('loadFloatSize', () => {
  it('brings a saved size bigger than the screen down to the screen, per side', () => {
    localStorage.setItem(KEY, '{"width":4000,"height":2500}')
    expect(loadFloatSize({ availWidth: 1920, availHeight: 1040 })).toEqual({ width: 1920, height: 1040 })
    localStorage.setItem(KEY, '{"width":900,"height":2500}')
    expect(loadFloatSize({ availWidth: 1920, availHeight: 1040 })).toEqual({ width: 900, height: 1040 })
  })

  it('puts no ceiling on a size when the screen reports none', () => {
    localStorage.setItem(KEY, '{"width":4000,"height":2500}')
    expect(loadFloatSize({ availWidth: 0, availHeight: 0 })).toEqual({ width: 4000, height: 2500 })
  })

  it('is 480x270 when nothing is saved', () => {
    expect(loadFloatSize()).toEqual({ width: 480, height: 270 })
  })

  it.each([
    ['not json'],
    ['null'],
    ['{"width":"x","height":1}'],
    ['{"width":-5,"height":300}'],
  ])('is 480x270 for the unusable saved value %s', (raw) => {
    localStorage.setItem(KEY, raw)
    expect(loadFloatSize()).toEqual({ width: 480, height: 270 })
  })

  it('returns a saved size as it is', () => {
    localStorage.setItem(KEY, '{"width":1000,"height":600}')
    expect(loadFloatSize()).toEqual({ width: 1000, height: 600 })
  })

  it('raises a saved size that is smaller than 480x270, per side', () => {
    localStorage.setItem(KEY, '{"width":100,"height":100}')
    expect(loadFloatSize()).toEqual({ width: 480, height: 270 })
    localStorage.setItem(KEY, '{"width":100,"height":900}')
    expect(loadFloatSize()).toEqual({ width: 480, height: 900 })
  })
})

describe('saveFloatSize', () => {
  it('is what loadFloatSize returns next time', () => {
    saveFloatSize({ width: 700, height: 400 })
    expect(loadFloatSize()).toEqual({ width: 700, height: 400 })
  })

  it.each([
    [Number.NaN, 300],
    [300, Number.POSITIVE_INFINITY],
    [0, 300],
    [300, -1],
  ])('ignores %s x %s and keeps what was saved', (width, height) => {
    saveFloatSize({ width: 700, height: 400 })
    saveFloatSize({ width, height })
    expect(loadFloatSize()).toEqual({ width: 700, height: 400 })
  })
})

describe('isFloatingSupported', () => {
  const api = { requestWindow: vi.fn() } as never

  it('is true with the API on a secure context', () => {
    expect(isFloatingSupported({ isSecureContext: true, documentPictureInPicture: api })).toBe(true)
  })

  it('is false when the browser has no such API', () => {
    expect(isFloatingSupported({ isSecureContext: true, documentPictureInPicture: undefined })).toBe(false)
    expect(isFloatingSupported({ isSecureContext: true, documentPictureInPicture: {} as never })).toBe(false)
  })

  it('is false on a page that is not a secure context', () => {
    expect(isFloatingSupported({ isSecureContext: false, documentPictureInPicture: api })).toBe(false)
  })
})

describe('floatingChannelFromPath', () => {
  it.each([
    ['/twitch/streamer', 'streamer'],
    ['/twitch/streamer/', 'streamer'],
    ['/twitch', null],
    ['/twitch/a/b', null],
    ['/youtube/abc', null],
    ['/', null],
  ])('reads %s as %s', (path, expected) => {
    expect(floatingChannelFromPath(path)).toBe(expected)
  })
})

describe('canPopOutOn', () => {
  it('is true on a live Twitch channel page', () => {
    expect(canPopOutOn('/twitch/x', live)).toBe(true)
  })

  it.each([
    ['a clip', '/twitch/x', clip],
    ['a VOD', '/twitch/x', vod],
    ['no detection yet', '/twitch/x', null],
    ['a YouTube page', '/youtube/x', live],
    ['the hub', '/', live],
    ['the Twitch listing page', '/twitch', live],
  ])('is false for %s', (_label, path, detection) => {
    expect(canPopOutOn(path, detection)).toBe(false)
  })
})

describe('floatingShouldEnd', () => {
  it.each([
    ['a YouTube page', '/youtube/abc', null],
    ['an HLS or DASH page', '/hls-dash/s', null],
    // /hls-dash itself opens on a default stream, so it plays its own video like the pages above.
    ['the HLS / DASH page, which starts a default stream', '/hls-dash', null],
    ['the HLS / DASH page with a trailing slash', '/hls-dash/', null],
    ['a Twitch page now playing a clip', '/twitch/x', clip],
    ['a Twitch page now playing a VOD', '/twitch/x', vod],
  ])('is true for %s', (_label, path, detection) => {
    expect(floatingShouldEnd(path, detection)).toBe(true)
  })

  it.each([
    ['a live Twitch page', '/twitch/x', live],
    ['the hub', '/', null],
    ['the Twitch listing page', '/twitch', null],
    ['a Twitch page whose detection has not arrived', '/twitch/x', null],
  ])('is false for %s', (_label, path, detection) => {
    expect(floatingShouldEnd(path, detection)).toBe(false)
  })
})
