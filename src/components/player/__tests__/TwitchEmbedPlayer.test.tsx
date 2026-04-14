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
  // Must use a real `function` (not arrow) so `new EmbedCtor(...)` works.
  function EmbedCtor(
    this: MockEmbed,
    id: string,
    options: Record<string, unknown>,
  ) {
    const embed = makeMockEmbed(id, options)
    embedInstances.push(embed)
    return embed
  }

  // Event-name constants that match the real SDK
  Object.assign(EmbedCtor, {
    VIDEO_READY: 'video.ready',
    VIDEO_PLAY: 'video.play',
  })

  window.Twitch = {
    Embed: EmbedCtor as unknown as NonNullable<typeof window.Twitch>['Embed'],
  }
}

function uninstallMockTwitch() {
  embedInstances.length = 0
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

  it('fires onError immediately for clip detection (SDK does not support clips)', async () => {
    const onError = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={clipDetection.originalUrl}
        detection={clipDetection}
        onError={onError}
      />,
    )
    await vi.runAllTimersAsync()
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('does not support clips'),
    )
    expect(embedInstances).toHaveLength(0)
  })

  it('constructs Twitch.Embed with muted autoplay for stream detection', async () => {
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
      />,
    )
    await vi.runAllTimersAsync()
    expect(embedInstances).toHaveLength(1)
    const opts = embedInstances[0].__options
    expect(opts.channel).toBe('ninja')
    expect(opts.autoplay).toBe(true)
    expect(opts.muted).toBe(true)
    expect(opts.parent).toEqual([window.location.hostname])
  })

  it('constructs Twitch.Embed with video: v<id> for VOD detection', async () => {
    render(
      <TwitchEmbedPlayer
        url={vodDetection.originalUrl}
        detection={vodDetection}
      />,
    )
    await vi.runAllTimersAsync()
    expect(embedInstances).toHaveLength(1)
    expect(embedInstances[0].__options.video).toBe('v123456789')
  })

  it('fires onReady on VIDEO_READY', async () => {
    const onReady = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onReady={onReady}
      />,
    )
    await vi.runAllTimersAsync()
    embedInstances[0].__fire('video.ready')
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('fires onPause via the Player instance from getPlayer()', async () => {
    const onPause = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onPause={onPause}
      />,
    )
    await vi.runAllTimersAsync()
    const embed = embedInstances[0]
    // Player-level listeners are wired AFTER VIDEO_READY
    embed.__fire('video.ready')
    embed.__player.__fire('pause')
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('fires onPlay via the Player PLAY event (both initial and resume)', async () => {
    const onPlay = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onPlay={onPlay}
      />,
    )
    await vi.runAllTimersAsync()
    const embed = embedInstances[0]
    embed.__fire('video.ready')
    embed.__player.__fire('play') // initial play
    embed.__player.__fire('play') // play-after-pause
    expect(onPlay).toHaveBeenCalledTimes(2)
  })

  it('fires onError when getPlayer throws inside VIDEO_READY', async () => {
    const onError = vi.fn()
    const onReady = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onReady={onReady}
        onError={onError}
      />,
    )
    await vi.runAllTimersAsync()
    const embed = embedInstances[0]
    // Force getPlayer to throw
    embed.getPlayer = vi.fn(() => {
      throw new Error('player unavailable')
    }) as typeof embed.getPlayer
    embed.__fire('video.ready')
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('Player API unavailable'),
    )
    expect(onReady).not.toHaveBeenCalled()
  })

  it('fires onOffline / onOnline for stream detection only', async () => {
    const onOffline = vi.fn()
    const onOnline = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onOffline={onOffline}
        onOnline={onOnline}
      />,
    )
    await vi.runAllTimersAsync()
    const embed = embedInstances[0]
    embed.__fire('video.ready')
    embed.__player.__fire('offline')
    embed.__player.__fire('online')
    expect(onOffline).toHaveBeenCalledTimes(1)
    expect(onOnline).toHaveBeenCalledTimes(1)
  })

  it('does NOT wire offline/online listeners for VOD detection', async () => {
    const onOffline = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={vodDetection.originalUrl}
        detection={vodDetection}
        onOffline={onOffline}
      />,
    )
    await vi.runAllTimersAsync()
    const embed = embedInstances[0]
    embed.__fire('video.ready')
    embed.__player.__fire('offline')
    expect(onOffline).not.toHaveBeenCalled()
    const events = (
      embed.__player.addEventListener as ReturnType<typeof vi.fn>
    ).mock.calls.map((c) => c[0])
    expect(events).not.toContain('offline')
    expect(events).not.toContain('online')
  })

  it('fires onPlaybackBlocked AND onError when browser blocks autoplay', async () => {
    const onPlaybackBlocked = vi.fn()
    const onError = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onPlaybackBlocked={onPlaybackBlocked}
        onError={onError}
      />,
    )
    await vi.runAllTimersAsync()
    const embed = embedInstances[0]
    embed.__fire('video.ready')
    embed.__player.__fire('playbackBlocked')
    expect(onPlaybackBlocked).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('Autoplay blocked'),
    )
  })

  it('fires onError after 15s if VIDEO_READY never arrives', async () => {
    const onError = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onError={onError}
      />,
    )
    // Flush waitForPaint (2x requestAnimationFrame ≈ 32ms) + async script
    // load microtasks without firing the 15s timeout.
    await vi.advanceTimersByTimeAsync(100)
    expect(onError).not.toHaveBeenCalled()
    // Now advance past the 15s budget to trigger the timeout.
    vi.advanceTimersByTime(15000)
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
    )
  })

  it('does NOT fire onError after VIDEO_READY even if 20s elapses', async () => {
    const onError = vi.fn()
    const onReady = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onError={onError}
        onReady={onReady}
      />,
    )
    // Flush waitForPaint RAFs so `new Embed` has run and embedInstances[0]
    // exists. 100ms covers the two RAFs without tripping the 15s timeout.
    await vi.advanceTimersByTimeAsync(100)
    embedInstances[0].__fire('video.ready')
    vi.advanceTimersByTime(20000)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
})
