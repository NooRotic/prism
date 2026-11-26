import { STORAGE_KEYS } from '../../../config/storageKeys'
import { resetFavoritesCache, setFavorite } from '../../favorites'
import { getPlaybackSnapshot } from '../../playbackLog'
import { createCastSender } from '../castSender'
import { CAST_NAMESPACE, type CastStream } from '../messages'
import { installFakeCast, type FakeCast } from './fakeCast'

const STREAM: CastStream = { id: 'abc', name: 'News One', url: 'https://h.test/a.m3u8?token=secret', kind: 'hls', live: true, logo: 'https://d.test/a.png' }
const scripts = () => document.querySelectorAll('script[src*="cast_sender.js"]')

let fake: FakeCast

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetFavoritesCache()
  document.head.innerHTML = ''
  fake = installFakeCast()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** A sender with the SDK loaded and a device found. */
function ready() {
  const sender = createCastSender()
  sender.load()
  fake.sdkReady()
  fake.castState('NOT_CONNECTED')
  return sender
}

async function connected() {
  const sender = ready()
  sender.start(STREAM, 'News')
  fake.sessionStarted('Living room')
  await Promise.resolve()
  return sender
}

describe('loading Google’s script', () => {
  it('waits to be asked, and adds it once', () => {
    const sender = createCastSender()
    expect(scripts()).toHaveLength(0)
    sender.load()
    sender.load()
    expect(scripts()).toHaveLength(1)
  })

  it('comes by itself in a tab that was casting', () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    createCastSender()
    expect(scripts()).toHaveLength(1)
  })

  it('does nothing in a browser without Cast', () => {
    vi.stubGlobal('chrome', undefined)
    const sender = createCastSender()
    sender.load()
    expect(scripts()).toHaveLength(0)
    expect(sender.view().available).toBe(false)
  })

  it('leaves Cast unavailable when the script does not load or says no', () => {
    const sender = createCastSender()
    sender.load()
    scripts()[0].dispatchEvent(new Event('error'))
    expect(sender.view().available).toBe(false)
    fake.sdkReady(false)
    expect(sender.view().available).toBe(false)
  })

  it('stays quiet when a blocker let only half of the SDK through', () => {
    vi.useFakeTimers()
    fake.hideChromeCast()
    const sender = createCastSender()
    sender.load()
    expect(() => {
      fake.sdkReady()
      vi.advanceTimersByTime(10_000)
    }).not.toThrow()
    expect(sender.view().available).toBe(false)
  })

  it('waits for the framework, which can come after Google says it is ready', () => {
    vi.useFakeTimers()
    fake.hideFramework()
    const sender = createCastSender()
    sender.load()
    fake.sdkReady()
    fake.showFramework()
    vi.advanceTimersByTime(500)
    fake.castState('NOT_CONNECTED')
    expect(sender.view().available).toBe(true)
  })
})

it('joins only its own tab’s session, with PRISM’s app', () => {
  ready()
  expect(fake.options).toEqual({ receiverApplicationId: '10E81A1E', autoJoinPolicy: 'tab_and_origin_scoped' })
})

it('is available only while a device is found', () => {
  const sender = ready()
  expect(sender.view().available).toBe(true)
  fake.castState('NO_DEVICES_AVAILABLE')
  expect(sender.view().available).toBe(false)
})

describe('starting', () => {
  it('opens the picker, then sends the page’s stream with the stars and the group', async () => {
    setFavorite('abc', true)
    const sender = ready()
    sender.start(STREAM, 'News')
    expect(fake.requestSession).toHaveBeenCalledTimes(1)
    expect(fake.loadMedia).not.toHaveBeenCalled()
    fake.sessionStarted('Living room')
    const { media, autoplay } = fake.loadMedia.mock.calls[0][0]
    expect(autoplay).toBe(true)
    expect(media).toMatchObject({
      contentId: 'abc',
      contentUrl: STREAM.url,
      contentType: 'application/x-mpegurl',
      streamType: 'LIVE',
      metadata: { title: 'News One', images: [{ url: STREAM.logo }] },
      customData: { v: 1, id: 'abc', kind: 'hls', live: true, favorites: ['abc'], group: 'News' },
    })
    expect(sender.view()).toMatchObject({ connected: true, device: 'Living room' })
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_CASTING)).toBe('1')
  })

  it('changes nothing when the picker is closed', async () => {
    const sender = ready()
    sender.start(STREAM, null)
    fake.cancelPicker()
    await Promise.resolve()
    await Promise.resolve()
    expect(sender.view().connected).toBe(false)
    fake.sessionStarted('TV') // started another way later: not with the abandoned stream
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })

  it('plays what was asked for once: a later cast started another way does not repeat it', async () => {
    await connected()
    fake.sessionEnded()
    fake.sessionStarted('TV')
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
  })

  it('says it is connecting, from the press to the session or the closed picker', async () => {
    const sender = ready()
    sender.start(STREAM, null)
    expect(sender.view().connecting).toBe(true)
    fake.cancelPicker()
    await Promise.resolve()
    await Promise.resolve()
    expect(sender.view().connecting).toBe(false)
    sender.start(STREAM, null)
    fake.sessionStarted('TV')
    expect(sender.view().connecting).toBe(false)
  })

  it('puts no address in the playback log', async () => {
    await connected()
    expect(JSON.stringify(getPlaybackSnapshot())).not.toContain('h.test')
  })
})

describe('a session taken up again after a reload', () => {
  it('changes nothing on the TV', () => {
    const sender = ready()
    fake.sessionResumed('Living room')
    expect(sender.view()).toMatchObject({ connected: true, device: 'Living room' })
    expect(fake.loadMedia).not.toHaveBeenCalled()
    expect(fake.sendMessage).not.toHaveBeenCalled()
  })
})

describe('joining a TV that is already on', () => {
  const PICK: CastStream = { ...STREAM, id: 'pick', name: 'Picked' }

  it('keeps the TV’s channel when it is playing, and shows it', () => {
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', { state: 'playing', id: 'b', name: 'Beta' })
    expect(fake.loadMedia).not.toHaveBeenCalled()
    expect(sender.view().now).toEqual({ id: 'b', name: 'Beta', state: 'playing' })
  })

  it.each(['tuning', 'buffering', 'paused'])('also while it is %s', (state) => {
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', { state, id: 'b', name: 'Beta' })
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })

  it.each(['idle', 'failed', 'ended'])('sends the page’s stream to a TV that is %s, as soon as it says so', (state) => {
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', { state })
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
    expect(fake.loadMedia.mock.calls[0][0].media).toMatchObject({ contentId: 'abc' })
  })

  it('sends it after 4 s to a TV that says nothing', () => {
    vi.useFakeTimers()
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', 'silent')
    vi.advanceTimersByTime(3_999)
    expect(fake.loadMedia).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
  })

  it('waits for the TV’s second telling, which comes 1.5 s after it is joined, with room to spare', () => {
    vi.useFakeTimers()
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', 'silent') // the first word was lost
    vi.advanceTimersByTime(3_000) // a slow second telling
    fake.message({ v: 1, type: 'now', id: 'b', name: 'Beta', state: 'playing' })
    vi.advanceTimersByTime(5_000)
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })

  it('believes Cast’s own media session at once', () => {
    vi.useFakeTimers()
    fake.mediaSession('PLAYING')
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', 'silent')
    vi.advanceTimersByTime(5_000)
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })

  it('asks the TV when Cast’s player is idle: it may be between channels', () => {
    fake.mediaSession('IDLE')
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', { state: 'tuning', id: 'b', name: 'Beta' })
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })

  it('sends the page’s stream when Cast’s player is idle and the TV says nothing is on', () => {
    fake.mediaSession('IDLE')
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', { state: 'failed', id: 'b', name: 'Beta' })
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
  })

  it('forgets the page’s stream when the session ends while it waits', () => {
    vi.useFakeTimers()
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', 'silent')
    vi.advanceTimersByTime(500)
    fake.sessionEnded()
    fake.sessionStarted('TV', 'silent') // started again from Chrome's menu, on a page that offers nothing
    vi.advanceTimersByTime(10_000)
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })

  it('sends a pick made while it waits, at once, and only that', () => {
    vi.useFakeTimers()
    const sender = ready()
    sender.start(STREAM, null)
    fake.sessionStarted('TV', 'silent')
    sender.tune(PICK, 'News')
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
    expect(fake.loadMedia.mock.calls[0][0].media).toMatchObject({ contentId: 'pick' })
    vi.advanceTimersByTime(10_000)
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
  })

  it('sends a pick made while connecting even to a playing TV', () => {
    const sender = ready()
    sender.start(STREAM, null)
    sender.tune(PICK, null)
    fake.sessionStarted('TV', { state: 'playing', id: 'b', name: 'Beta' })
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
    expect(fake.loadMedia.mock.calls[0][0].media).toMatchObject({ contentId: 'pick' })
  })

  it('from Chrome’s own menu follows the same rule', () => {
    const sender = ready()
    sender.offer(() => ({ stream: STREAM, group: null }))
    fake.sessionStarted('TV', { state: 'playing', id: 'b', name: 'Beta' })
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })
})

describe('while it looks for the TV after a reload', () => {
  const reloaded = () => {
    sessionStorage.setItem(STORAGE_KEYS.SESSION_CASTING, '1')
    return ready()
  }

  it('keeps what is picked for the TV, the last pick only', () => {
    const sender = reloaded()
    sender.tune(STREAM, null)
    sender.tune({ ...STREAM, id: 'b' }, 'News')
    expect(fake.loadMedia).not.toHaveBeenCalled()
    fake.sessionResumed('Living room')
    expect(fake.loadMedia).toHaveBeenCalledTimes(1)
    expect(fake.loadMedia.mock.calls[0][0].media).toMatchObject({ contentId: 'b', customData: { group: 'News' } })
  })

  it('forgets the pick when the TV is not there any more', () => {
    vi.useFakeTimers()
    const sender = reloaded()
    sender.tune(STREAM, null)
    vi.advanceTimersByTime(5_000)
    fake.sessionStarted('TV')
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })

  it('never tunes it to the page’s stream by itself, whatever Google calls the rejoin', () => {
    const sender = reloaded()
    sender.offer(() => ({ stream: STREAM, group: null }))
    fake.sessionStarted('Living room')
    expect(sender.view()).toMatchObject({ connected: true, rejoining: false })
    expect(fake.loadMedia).not.toHaveBeenCalled()
  })
})

describe('what the TV says', () => {
  it('is followed, and nonsense is ignored', async () => {
    const sender = await connected()
    fake.message({ v: 1, type: 'now', id: 'b', name: 'Sports', state: 'playing' })
    expect(sender.view().now).toEqual({ id: 'b', name: 'Sports', state: 'playing' })
    fake.message({ v: 1, type: 'now', id: 'b', name: 'Sports', state: 'exploding' })
    expect(sender.view().now?.state).toBe('playing')
  })

  it('can be paused', async () => {
    const sender = await connected()
    sender.togglePause()
    expect(fake.playOrPause).toHaveBeenCalledTimes(1)
  })
})

describe('stars', () => {
  it('go to the TV when they change while connected, and only then', async () => {
    const before = ready()
    setFavorite('x', true)
    expect(fake.sendMessage).not.toHaveBeenCalled()
    before.start(STREAM, null)
    fake.sessionStarted('TV')
    setFavorite('y', true)
    expect(fake.sendMessage).toHaveBeenCalledTimes(1)
    expect(fake.sendMessage).toHaveBeenCalledWith(CAST_NAMESPACE, { v: 1, type: 'context', favorites: ['x', 'y'] })
    fake.sessionEnded()
    setFavorite('z', true)
    expect(fake.sendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('tuning', () => {
  it('loads on the TV while connected, and does nothing otherwise', async () => {
    const idle = ready()
    idle.tune(STREAM, null)
    expect(fake.loadMedia).not.toHaveBeenCalled()
    const sender = await connected()
    sender.tune({ ...STREAM, id: null, name: 'Pasted', live: false, logo: null }, null)
    expect(fake.loadMedia.mock.lastCall?.[0].media).toMatchObject({ contentId: 'pasted', streamType: 'BUFFERED', customData: { id: null, live: false } })
  })

  it('a refused load is the TV’s to show', async () => {
    const sender = await connected()
    fake.loadMedia.mockRejectedValueOnce('load_failed')
    expect(() => sender.tune(STREAM, null)).not.toThrow()
    await Promise.resolve()
    expect(sender.view().connected).toBe(true)
  })
})

describe('ending', () => {
  it('by Stop here remembers the channel the TV was on', async () => {
    const sender = await connected()
    fake.message({ v: 1, type: 'now', id: 'b', name: 'Sports', state: 'playing' })
    sender.stop()
    expect(fake.endCurrentSession).toHaveBeenCalledWith(true)
    fake.sessionEnded()
    expect(sender.view()).toMatchObject({ connected: false, device: null, now: null, endedBySelf: false, stoppedOn: 'b' })
    expect(sessionStorage.getItem(STORAGE_KEYS.SESSION_CASTING)).toBeNull()
    sender.clearEnded()
    expect(sender.view().stoppedOn).toBeNull()
  })

  it('by Stop, with something picked before it has ended: nothing goes to the TV, and the pick stands', async () => {
    const sender = await connected()
    fake.message({ v: 1, type: 'now', id: 'b', name: 'Sports', state: 'playing' })
    fake.loadMedia.mockClear()
    sender.stop()
    sender.tune({ ...STREAM, id: 'c' }, null)
    expect(fake.loadMedia).not.toHaveBeenCalled()
    fake.sessionEnded()
    expect(sender.view()).toMatchObject({ connected: false, endedBySelf: false, stoppedOn: null })
  })

  it('any other way is told apart, and a new cast clears it', async () => {
    const sender = await connected()
    fake.sessionEnded()
    expect(sender.view()).toMatchObject({ connected: false, endedBySelf: true, stoppedOn: null })
    sender.start(STREAM, null)
    fake.sessionStarted('TV')
    expect(sender.view().endedBySelf).toBe(false)
  })
})

it('tells its listeners, with the same view until something changes', async () => {
  const sender = ready()
  const heard = vi.fn()
  const off = sender.subscribe(heard)
  expect(sender.view()).toBe(sender.view())
  fake.castState('NO_DEVICES_AVAILABLE')
  fake.castState('NO_DEVICES_AVAILABLE')
  expect(heard).toHaveBeenCalledTimes(1)
  off()
})
