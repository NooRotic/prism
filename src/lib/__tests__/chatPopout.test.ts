import { vi } from 'vitest'
import {
  POPOUT_WINDOW_NAME,
  boundsToFeatures,
  buildPopoutUrl,
  createPopoutBus,
  loadBounds,
  saveBounds,
} from '../chatPopout'
import type { PopoutMessage } from '../chatPopout'
import { STORAGE_KEYS } from '../../config/storageKeys'

const KEY = STORAGE_KEYS.LOCAL_CHAT_POPOUT_BOUNDS

describe('loadBounds', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing is saved', () => {
    expect(loadBounds()).toBeNull()
  })

  it.each([
    ['malformed JSON', '{'],
    ['the JSON null', 'null'],
    ['a JSON array', '[]'],
    ['non-numeric fields', '{"width":"400","height":"700","left":"0","top":"0"}'],
    ['a missing field', '{"width":400,"height":700,"left":0}'],
    ['a NaN field (serialised as null)', JSON.stringify({ width: NaN, height: 700, left: 0, top: 0 })],
    ['a width below 200', '{"width":199,"height":700,"left":0,"top":0}'],
    ['a height below 200', '{"width":400,"height":0,"left":0,"top":0}'],
    ['the position a minimized Windows window reports', '{"width":420,"height":720,"left":-32000,"top":-32000}'],
  ])('ignores %s', (_label, raw) => {
    localStorage.setItem(KEY, raw)
    expect(loadBounds()).toBeNull()
  })

  it('returns saved bounds, including negative and zero positions (other monitors)', () => {
    const bounds = { width: 420, height: 720, left: -1500, top: 0 }
    localStorage.setItem(KEY, JSON.stringify(bounds))
    expect(loadBounds()).toEqual(bounds)
  })
})

describe('saveBounds', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips through loadBounds', () => {
    const bounds = { width: 500, height: 800, left: 100, top: 50 }
    saveBounds(bounds)
    expect(loadBounds()).toEqual(bounds)
  })

  it('does not throw when localStorage.setItem throws', () => {
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    expect(() => saveBounds({ width: 500, height: 800, left: 0, top: 0 })).not.toThrow()
    spy.mockRestore()
  })

  it.each([
    ['zero-sized bounds', { width: 0, height: 0, left: 0, top: 0 }],
    ['a width below 200', { width: 150, height: 700, left: 10, top: 10 }],
    ['a NaN size', { width: NaN, height: 700, left: 10, top: 10 }],
    ['an infinite position', { width: 420, height: 700, left: Infinity, top: 10 }],
    ['the position a minimized Windows window reports', { width: 420, height: 720, left: -32000, top: -32000 }],
  ])('does not overwrite good saved bounds with %s', (_label, bad) => {
    const good = { width: 500, height: 800, left: 100, top: 50 }
    saveBounds(good)

    saveBounds(bad)

    expect(loadBounds()).toEqual(good)
  })

  it('still saves a position on a monitor to the left of or above the main one', () => {
    const bounds = { width: 420, height: 720, left: -1900, top: -300 }
    saveBounds(bounds)
    expect(loadBounds()).toEqual(bounds)
  })
})

describe('boundsToFeatures', () => {
  it('uses a default 420 x 720 window with no position when there are no saved bounds', () => {
    const features = boundsToFeatures(null)
    expect(features).toContain('popup=yes')
    expect(features).toContain('width=420,height=720')
    expect(features).not.toContain('left=')
    expect(features).not.toContain('top=')
  })

  it('carries all four saved values, rounded', () => {
    const features = boundsToFeatures({ width: 500.4, height: 800.6, left: -20.2, top: 30.5 })
    expect(features).toContain('popup=yes')
    expect(features).toContain('width=500')
    expect(features).toContain('height=801')
    expect(features).toContain('left=-20')
    expect(features).toContain('top=31')
  })
})

describe('buildPopoutUrl', () => {
  it('points at the PRISM chat page and encodes the channel', () => {
    expect(buildPopoutUrl('streamer')).toBe('/chat/streamer')
    expect(buildPopoutUrl('a b/c')).toBe('/chat/a%20b%2Fc')
  })
})

// BroadcastChannel semantics: a message reaches every OTHER open channel with
// the same name, never the sender.
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  closed = false
  listeners = new Set<(event: { data: unknown }) => void>()
  name: string
  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }
  postMessage(data: unknown) {
    for (const other of FakeBroadcastChannel.instances) {
      if (other !== this && other.name === this.name && !other.closed) {
        other.listeners.forEach((listener) => listener({ data }))
      }
    }
  }
  addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: (event: { data: unknown }) => void) {
    this.listeners.delete(listener)
  }
  close() {
    this.closed = true
  }
}

describe('createPopoutBus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    FakeBroadcastChannel.instances = []
  })

  it('uses the shared name and delivers to other buses but not to the sender', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const main = createPopoutBus()
    const popout = createPopoutBus()
    const atPopout = vi.fn()
    const atMain = vi.fn()
    popout.subscribe(atPopout)
    main.subscribe(atMain)

    main.post({ type: 'set-channel', channel: 'streamer' })

    expect(FakeBroadcastChannel.instances.every((c) => c.name === POPOUT_WINDOW_NAME)).toBe(true)
    expect(atPopout).toHaveBeenCalledExactlyOnceWith({ type: 'set-channel', channel: 'streamer' })
    expect(atMain).not.toHaveBeenCalled()
  })

  it('subscribe returns an unsubscribe', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const main = createPopoutBus()
    const popout = createPopoutBus()
    const cb = vi.fn()
    const unsubscribe = popout.subscribe(cb)

    unsubscribe()
    main.post({ type: 'ping' })

    expect(cb).not.toHaveBeenCalled()
  })

  it('ignores messages that are not valid pop-out messages', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const bus = createPopoutBus()
    const cb = vi.fn()
    bus.subscribe(cb)
    const raw = new FakeBroadcastChannel(POPOUT_WINDOW_NAME)

    raw.postMessage(null)
    raw.postMessage('ping')
    raw.postMessage({ type: 'nope' })
    raw.postMessage({ type: 'hello' }) // missing channel
    raw.postMessage({ type: 'set-channel', channel: 42 })
    raw.postMessage({ type: 'ping' } satisfies PopoutMessage)

    expect(cb).toHaveBeenCalledExactlyOnceWith({ type: 'ping' })
  })

  it('close() closes the underlying channel', () => {
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    createPopoutBus().close()
    expect(FakeBroadcastChannel.instances[0].closed).toBe(true)
  })

  it('is a harmless no-op bus when BroadcastChannel does not exist', () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const bus = createPopoutBus()
    const cb = vi.fn()

    expect(() => bus.post({ type: 'ping' })).not.toThrow()
    const unsubscribe = bus.subscribe(cb)
    expect(typeof unsubscribe).toBe('function')
    expect(() => unsubscribe()).not.toThrow()
    expect(() => bus.close()).not.toThrow()
    expect(cb).not.toHaveBeenCalled()
  })
})
