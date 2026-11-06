import { vi } from 'vitest'

/**
 * Test doubles for the floating video window. jsdom has no picture-in-picture
 * API, so tests hand `openFloatingWindow` a fake window whose document is a real
 * second `Document`, and a fake Twitch embed that records what it was asked to do.
 */

export interface FakeFloatingWindow {
  /** Stands in for the window Chrome would return. */
  win: Window
  /** Plays an event in as if the browser fired it on the window (`pagehide`, `resize`). */
  emit: (type: string) => void
  /** Changes what `innerWidth` / `innerHeight` report; follow with `emit('resize')`. */
  setSize: (width: number, height: number) => void
}

export function createFakeFloatingWindow(): FakeFloatingWindow {
  const listeners = new Map<string, Set<() => void>>()
  const emit = (type: string) => {
    listeners.get(type)?.forEach((callback) => callback())
  }
  const fake = {
    document: document.implementation.createHTMLDocument(''),
    innerWidth: 480,
    innerHeight: 270,
    addEventListener: (type: string, callback: () => void) => {
      const existing = listeners.get(type)
      if (existing) existing.add(callback)
      else listeners.set(type, new Set([callback]))
    },
    removeEventListener: (type: string, callback: () => void) => {
      listeners.get(type)?.delete(callback)
    },
    // Closing a real window fires pagehide in it.
    close: vi.fn(() => emit('pagehide')),
    // Delegate at call time so fake timers installed by a test take effect.
    setTimeout: (callback: () => void, ms?: number) => globalThis.setTimeout(callback, ms),
    clearTimeout: (id: ReturnType<typeof globalThis.setTimeout>) => globalThis.clearTimeout(id),
  }
  return {
    win: fake as unknown as Window,
    emit,
    setSize: (width, height) => {
      fake.innerWidth = width
      fake.innerHeight = height
    },
  }
}

export interface FakeEmbedInstance {
  id: string
  options: Record<string, unknown>
  destroy: ReturnType<typeof vi.fn>
  /** `setChannel` is absent when the fake was made with `playerHasSetChannel: false`. */
  player: { setChannel?: ReturnType<typeof vi.fn> }
  /** Plays a Twitch embed event in (e.g. `Embed.VIDEO_READY`). */
  fire: (event: string) => void
}

export function createFakeTwitch({
  playerHasSetChannel = true,
  getPlayerMode = 'normal',
}: {
  playerHasSetChannel?: boolean
  /** The live SDK's player is not always usable: `getPlayer()` may throw or return nothing. */
  getPlayerMode?: 'normal' | 'throws' | 'undefined'
} = {}) {
  const instances: FakeEmbedInstance[] = []

  class Embed implements FakeEmbedInstance {
    static VIDEO_READY = 'video.ready'
    static VIDEO_PLAY = 'video.play'
    static ONLINE = 'video.online'
    static OFFLINE = 'video.offline'

    id: string
    options: Record<string, unknown>
    destroy = vi.fn()
    player: { setChannel?: ReturnType<typeof vi.fn> }
    private handlers = new Map<string, Array<() => void>>()

    constructor(id: string, options: Record<string, unknown>) {
      this.id = id
      this.options = options
      this.player = playerHasSetChannel ? { setChannel: vi.fn() } : {}
      instances.push(this)
    }

    addEventListener(event: string, callback: () => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), callback])
    }

    getPlayer() {
      if (getPlayerMode === 'throws') throw new Error('The player is not ready')
      if (getPlayerMode === 'undefined') return undefined
      return this.player
    }

    fire(event: string) {
      this.handlers.get(event)?.forEach((callback) => callback())
    }
  }

  /** What the real loader does: after it, the window has a `Twitch` global. */
  const loadScript = vi.fn(async (win: Window) => {
    ;(win as unknown as { Twitch?: unknown }).Twitch = { Embed }
  })

  return { Embed, instances, loadScript }
}
