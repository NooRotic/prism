import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TwitchEmbedPlayer from '../TwitchEmbedPlayer'
import type { URLDetectionResult } from '../../../lib/urlDetection'

// ---- Mock Twitch SDK -------------------------------------------------------
// The real SDK mounts an iframe and fires events on two objects:
//   - Twitch.Embed:   VIDEO_READY, VIDEO_PLAY
//   - Twitch.Player:  PAUSE, PLAY, OFFLINE, ONLINE, ENDED, PLAYBACK_BLOCKED
// The mock exposes `__fire()` on both so each test can drive them explicitly.

type Listener = () => void

interface MockPlayer {
  pause: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  __fire: (event: string) => void
}

interface MockEmbed {
  addEventListener: ReturnType<typeof vi.fn>
  getPlayer: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  __fire: (event: string) => void
  __player: MockPlayer
  __options: Record<string, unknown>
  __id: string
}

const embedInstances: MockEmbed[] = []

function makeMockPlayer(): MockPlayer {
  const listeners = new Map<string, Listener[]>()
  return {
    pause: vi.fn(),
    play: vi.fn(),
    addEventListener: vi.fn((event: string, cb: Listener) => {
      const arr = listeners.get(event) ?? []
      arr.push(cb)
      listeners.set(event, arr)
    }),
    __fire: (event) => {
      for (const cb of listeners.get(event) ?? []) cb()
    },
  }
}

function makeMockEmbed(
  id: string,
  options: Record<string, unknown>,
): MockEmbed {
  const listeners = new Map<string, Listener[]>()
  const player = makeMockPlayer()
  return {
    addEventListener: vi.fn((event: string, cb: Listener) => {
      const arr = listeners.get(event) ?? []
      arr.push(cb)
      listeners.set(event, arr)
    }),
    getPlayer: vi.fn(() => player),
    destroy: vi.fn(),
    __fire: (event) => {
      for (const cb of listeners.get(event) ?? []) cb()
    },
    __player: player,
    __options: options,
    __id: id,
  }
}

function installMockTwitch() {
  const EmbedCtor = vi.fn(
    (id: string, options: Record<string, unknown>) => {
      const embed = makeMockEmbed(id, options)
      embedInstances.push(embed)
      return embed
    },
  ) as unknown as typeof window.Twitch.Embed

  // Event-name constants that match the real SDK
  Object.assign(EmbedCtor, {
    VIDEO_READY: 'video.ready',
    VIDEO_PLAY: 'video.play',
  })

  window.Twitch = { Embed: EmbedCtor }
}

function uninstallMockTwitch() {
  embedInstances.length = 0
  // @ts-expect-error - intentionally clearing
  delete window.Twitch
  document
    .querySelectorAll('script[src="https://embed.twitch.tv/embed/v1.js"]')
    .forEach((s) => s.remove())
}

// ---- Fixtures --------------------------------------------------------------

const streamDetection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-stream',
  originalUrl: 'https://twitch.tv/ninja',
  playableUrl: 'https://twitch.tv/ninja',
  metadata: { channelName: 'ninja' },
}

const vodDetection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-video',
  originalUrl: 'https://twitch.tv/videos/123456789',
  playableUrl: 'https://twitch.tv/videos/123456789',
  metadata: { videoId: '123456789' },
}

const clipDetection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-clip',
  originalUrl: 'https://clips.twitch.tv/AbcDef123',
  playableUrl: 'https://clips.twitch.tv/AbcDef123',
  metadata: { clipId: 'AbcDef123' },
}

// ---- Tests -----------------------------------------------------------------

describe('TwitchEmbedPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    installMockTwitch()
  })

  afterEach(() => {
    cleanup()
    uninstallMockTwitch()
    vi.useRealTimers()
  })

  it('placeholder — harness compiles', () => {
    expect(window.Twitch?.Embed).toBeDefined()
  })
})
