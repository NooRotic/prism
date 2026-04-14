# Twitch Player Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Twitch player path to match what the Twitch Embed JS SDK actually supports, wire the real pause/offline/playback-blocked events, correct the clip iframe URL, and document the port-80 localhost constraint so in-browser testing actually works.

**Architecture:** This plan is surgical but touches more than the original sketch because research revealed three root-cause bugs in the current code that explain v1's "silent embed failures":

1. **Clips don't support the JS SDK at all** (`Twitch.Embed` only accepts `channel`/`video`/`collection`). Current code passes `clip: <slug>` to `new Twitch.Embed()` — silently ignored. Fix: clips skip the SDK and go straight to iframe. The fallback chain splits by `detection.platform`.
2. **`OFFLINE`/`ONLINE`/`PAUSE`/`PLAY`/`PLAYBACK_BLOCKED`/`ENDED` events live on `Twitch.Player`, not `Twitch.Embed`.** The Embed class fires only `VIDEO_READY` and `VIDEO_PLAY`. Fix: after `VIDEO_READY` fires, call `embed.getPlayer()` and attach the full set of listeners to the returned Player.
3. **Clip iframe URL is wrong.** `buildTwitchEmbedUrl` produces `https://player.twitch.tv/?clip=<slug>&parent=<host>`, but per Twitch docs clips must use `https://clips.twitch.tv/embed?clip=<slug>&parent=<host>`. The current URL likely silent-fails in many cases. Fix: update the builder.

Additionally: **Vite dev on port 5173 cannot load Twitch embeds** — Twitch assumes port 80 for `parent=localhost` and has no override. We'll use a Cloudflared tunnel (`cloudflared tunnel --url http://localhost:5173`) during manual testing — documented as a prerequisite in the checklist.

**Tech Stack:** React 19, TypeScript 6, Vitest 4, @testing-library/react 16, Twitch Embed JS SDK (`embed.twitch.tv/embed/v1.js`), Cloudflared (for local HTTPS tunnel during manual test). Branch: `feature/phase1-core-libs` (stay on it, no merge this session).

**Research sources** (recorded here so anyone executing the plan can verify the facts above without re-searching):
- https://dev.twitch.tv/docs/embed/video-and-clips/ — canonical list of Embed/Player events, clip iframe URL format, parent param rules.
- https://dev.twitch.tv/docs/embed/everything/ — `Twitch.Embed` constructor signature, confirms only `channel`/`video`/`collection` options.
- https://discuss.dev.twitch.com/t/embedding-player-on-localhost/25991 — the "port 80 only" constraint for localhost embeds.
- https://discuss.dev.twitch.com/t/embedded-twitch-clips/32331 — `parents should be domain names only` (no paths) and the canonical `clips.twitch.tv/embed?clip=<slug>&parent=<host>` iframe URL.

---

## Out of scope

- `VideoJSPlayer`, `DashJSPlayer`, `YouTubePlayer` stubs — not touched.
- `tsconfig` vitest-types fix — deferred to main-merge task.
- Taste Profile UI, CI/CD, merging to main — not touched.
- `AppContext.tsx` — not touched (offline state stays local to `PlayerHost`).
- OAuth flow, channel data hooks — not touched.

---

## File Structure

**Files modified:**
- `src/lib/urlDetection.ts` — fix `buildTwitchEmbedUrl` clip URL; update `getRecommendedEngine` so clips start at `twitch-iframe`.
- `src/lib/__tests__/urlDetection.test.ts` — update/add tests for new clip iframe URL and clip recommended engine.
- `src/types/player.ts` — extend `PlayerProps` with `onOffline` / `onOnline` / `onPlaybackBlocked` / `onEnded` optional callbacks.
- `src/components/player/TwitchEmbedPlayer.tsx` — rewrite: defensive clip guard, stream/VOD-only option building, `getPlayer()`-based event wiring (PAUSE/PLAY/OFFLINE/ONLINE/ENDED/PLAYBACK_BLOCKED), `muted: true` for autoplay reliability, timeout tightening.
- `src/components/player/PlayerHost.tsx` — split `getFallbackChain` for `twitch-clip` platform; add `isOffline` local state + offline overlay; pass new callbacks through; expand debug overlay; add Force Advance + Retry buttons.

**Files created:**
- `src/components/player/__tests__/TwitchEmbedPlayer.test.tsx` — mock Twitch SDK harness + behavior tests.
- `src/components/player/__tests__/PlayerHost.test.tsx` — mocked-children harness + offline/debug tests.
- `docs/manual-test-twitch-player.md` — one-page manual checklist, including cloudflared tunnel setup.

**Files NOT modified:**
- `src/components/player/TwitchIframePlayer.tsx` — it consumes `buildTwitchEmbedUrl` which we fix upstream; no changes to the component itself.
- `src/components/player/FallbackCard.tsx` — unchanged.
- `src/contexts/AppContext.tsx` — unchanged.

---

## Task 1: Fix `buildTwitchEmbedUrl` for clips + update `getRecommendedEngine`

**Problem recap:** Per https://dev.twitch.tv/docs/embed/video-and-clips/, clips must be embedded via `https://clips.twitch.tv/embed?clip=<slug>&parent=<domain>`. Current code produces `https://player.twitch.tv/?clip=<slug>&parent=<domain>`, which is the wrong host + wrong path. Also, `getRecommendedEngine` returns `twitch-sdk` for clips, but the SDK doesn't support clips — so the host immediately fails out and falls through to iframe, wasting ~5s and polluting logs.

**Files:**
- Modify: `src/lib/urlDetection.ts`
- Test: `src/lib/__tests__/urlDetection.test.ts`

- [ ] **Step 1: Add failing tests for the new clip iframe URL and clip recommended engine**

Append to `src/lib/__tests__/urlDetection.test.ts` (put these tests in a new `describe('buildTwitchEmbedUrl - clips', ...)` block at the end; if matching describe blocks already exist, add tests inside them):

```ts
import { describe, it, expect } from 'vitest'
import {
  buildTwitchEmbedUrl,
  getRecommendedEngine,
  detectURLType,
} from '../urlDetection'

describe('buildTwitchEmbedUrl - clips use clips.twitch.tv host', () => {
  it('produces a clips.twitch.tv/embed URL for clip detections', () => {
    const detection = detectURLType(
      'https://clips.twitch.tv/AbcDef123SlugXyz',
    )
    const url = buildTwitchEmbedUrl(detection, 'example.com')
    expect(url).toBe(
      'https://clips.twitch.tv/embed?clip=AbcDef123SlugXyz&parent=example.com',
    )
  })

  it('uses player.twitch.tv for VOD detections', () => {
    const detection = detectURLType('https://twitch.tv/videos/123456789')
    const url = buildTwitchEmbedUrl(detection, 'example.com')
    expect(url).toBe(
      'https://player.twitch.tv/?video=v123456789&parent=example.com',
    )
  })

  it('uses player.twitch.tv for live stream detections', () => {
    const detection = detectURLType('https://twitch.tv/ninja')
    const url = buildTwitchEmbedUrl(detection, 'example.com')
    expect(url).toBe(
      'https://player.twitch.tv/?channel=ninja&parent=example.com',
    )
  })
})

describe('getRecommendedEngine - clips', () => {
  it('recommends twitch-iframe for clip platform (SDK does not support clips)', () => {
    const detection = detectURLType('https://clips.twitch.tv/AbcDef123')
    expect(getRecommendedEngine(detection)).toBe('twitch-iframe')
  })

  it('recommends twitch-sdk for stream platform', () => {
    const detection = detectURLType('https://twitch.tv/ninja')
    expect(getRecommendedEngine(detection)).toBe('twitch-sdk')
  })

  it('recommends twitch-sdk for VOD platform', () => {
    const detection = detectURLType('https://twitch.tv/videos/123456789')
    expect(getRecommendedEngine(detection)).toBe('twitch-sdk')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- urlDetection`
Expected: the new tests FAIL — current code returns `https://player.twitch.tv/?clip=...` and recommends `twitch-sdk` for clips.

- [ ] **Step 3: Update `buildTwitchEmbedUrl` in `src/lib/urlDetection.ts`**

Find the existing `buildTwitchEmbedUrl` function (around line 108) and replace it with:

```ts
/**
 * Build a Twitch embed URL with the correct parent parameter.
 *
 * IMPORTANT: clips MUST use `clips.twitch.tv/embed?clip=<slug>` per Twitch docs.
 * Streams and VODs use `player.twitch.tv/?channel=` or `?video=v<id>`.
 * See https://dev.twitch.tv/docs/embed/video-and-clips/ for format spec.
 */
export function buildTwitchEmbedUrl(
  detection: URLDetectionResult,
  parent?: string,
): string | null {
  const hostname =
    parent || (typeof window !== 'undefined' ? window.location.hostname : '')
  if (!hostname) return null

  if (detection.platform === 'twitch-clip' && detection.metadata?.clipId) {
    const params = new URLSearchParams({
      clip: detection.metadata.clipId,
      parent: hostname,
    })
    return `https://clips.twitch.tv/embed?${params.toString()}`
  }

  const base = 'https://player.twitch.tv/'
  const params = new URLSearchParams({ parent: hostname })

  if (detection.platform === 'twitch-video' && detection.metadata?.videoId) {
    params.set('video', `v${detection.metadata.videoId}`)
  } else if (
    detection.platform === 'twitch-stream' &&
    detection.metadata?.channelName
  ) {
    params.set('channel', detection.metadata.channelName)
  } else {
    return null
  }

  return `${base}?${params.toString()}`
}
```

- [ ] **Step 4: Update `getRecommendedEngine` to recognize clip platform**

In the same file, replace `getRecommendedEngine` with:

```ts
export function getRecommendedEngine(result: URLDetectionResult): PlayerEngine {
  switch (result.type) {
    case 'twitch':
      // Clips are iframe-only — the JS SDK does not accept `clip`.
      return result.platform === 'twitch-clip' ? 'twitch-iframe' : 'twitch-sdk'
    case 'youtube':
      return 'reactplayer'
    case 'dash':
      return 'dashjs'
    case 'hls':
    case 'mp4':
      return 'videojs'
    default:
      return 'videojs'
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- urlDetection`
Expected: all urlDetection tests pass (pre-existing + new).

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/urlDetection.ts src/lib/__tests__/urlDetection.test.ts
rtk git commit -m "fix(urlDetection): clips use clips.twitch.tv/embed, recommend iframe for clip platform"
```

---

## Task 2: Extend `PlayerProps` with offline / online / ended / playback-blocked callbacks

**Files:**
- Modify: `src/types/player.ts`

- [ ] **Step 1: Replace `src/types/player.ts` contents**

```ts
import type { URLDetectionResult, PlayerEngine } from '../lib/urlDetection'

export interface PlayerProps {
  url: string
  detection: URLDetectionResult
  onReady?: () => void
  onError?: (error: string) => void
  onPlay?: () => void
  onPause?: () => void
  /** Stream-only. Fires when the SDK reports the channel is offline. */
  onOffline?: () => void
  /** Stream-only. Fires when the SDK reports the channel went live. */
  onOnline?: () => void
  /** VOD-only. Fires when playback reaches the end of the video. */
  onEnded?: () => void
  /** Fires when the browser blocks autoplay (policy). Usually triggers fallback. */
  onPlaybackBlocked?: () => void
}

export interface PlayerHostState {
  currentUrl: string
  detection: URLDetectionResult | null
  activeEngine: PlayerEngine
  fallbackStep: number
  debugMode: boolean
  error: string | null
}
```

- [ ] **Step 2: Verify type-check**

Run: `cd C:/Dev/projects/twitch-glaze-me && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors caused by this file.

- [ ] **Step 3: Commit**

```bash
rtk git add src/types/player.ts
rtk git commit -m "feat(player): add onOffline/onOnline/onEnded/onPlaybackBlocked to PlayerProps"
```

---

## Task 3: Split the fallback chain for clips in `PlayerHost`

Clips should start on `twitch-iframe` (not `twitch-sdk`) and the chain should have only two steps.

**Files:**
- Modify: `src/components/player/PlayerHost.tsx` (just the `getFallbackChain` helper — rest of the file is rewritten in Task 8)

> Note: This is a small pre-emptive edit so `TwitchEmbedPlayer` tests in Task 5 have the right expectations. The full `PlayerHost` rewrite happens in Task 8.

- [ ] **Step 1: Edit `getFallbackChain` in `src/components/player/PlayerHost.tsx`**

Find the existing function (lines 36–52) and replace it with:

```ts
function getFallbackChain(detection: URLDetectionResult): PlayerEngine[] {
  switch (detection.type) {
    case 'twitch':
      // Clips are iframe-only — skip the SDK step entirely.
      return detection.platform === 'twitch-clip'
        ? ['twitch-iframe', 'fallback']
        : ['twitch-sdk', 'twitch-iframe', 'fallback']
    case 'youtube':
      return ['reactplayer', 'fallback']
    case 'hls':
    case 'mp4':
      return ['videojs', 'fallback']
    case 'dash':
      return ['dashjs', 'fallback']
    default:
      return ['fallback']
  }
}
```

- [ ] **Step 2: Run the full test suite to confirm no regression**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test`
Expected: all pre-existing tests pass.

- [ ] **Step 3: Commit**

```bash
rtk git add src/components/player/PlayerHost.tsx
rtk git commit -m "feat(player): clips use two-step iframe→fallback chain (SDK has no clip support)"
```

---

## Task 4: Test harness for `TwitchEmbedPlayer`

Stand up a reusable mock of `window.Twitch.Embed` that lets tests fire events on both the Embed and the underlying Player.

**Files:**
- Create: `src/components/player/__tests__/TwitchEmbedPlayer.test.tsx`

- [ ] **Step 1: Write the harness file**

Create `src/components/player/__tests__/TwitchEmbedPlayer.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the placeholder test**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- TwitchEmbedPlayer`
Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
rtk git add src/components/player/__tests__/TwitchEmbedPlayer.test.tsx
rtk git commit -m "test(player): scaffold TwitchEmbedPlayer test harness with dual-event mock"
```

---

## Task 5: Rewrite `TwitchEmbedPlayer` — defensive clip guard, getPlayer() wiring, tightened timeout

This is the core fix. The rewrite:
1. Defensively bails on clip detections (logs to `onError`, lets the host advance).
2. Starts the 5s timeout *before* `loadTwitchScript()` so it covers script load + construction + ready.
3. After `VIDEO_READY` fires, calls `embed.getPlayer()` and attaches PAUSE / PLAY / OFFLINE / ONLINE / ENDED / PLAYBACK_BLOCKED listeners to the Player.
4. Sets `muted: true` in Embed options so autoplay reliably starts (browsers block unmuted autoplay).
5. Treats `PLAYBACK_BLOCKED` as an error → `onError` → fallback chain advances.

**Files:**
- Modify: `src/components/player/TwitchEmbedPlayer.tsx`

- [ ] **Step 1: Replace `src/components/player/TwitchEmbedPlayer.tsx` contents**

```tsx
import { useEffect, useRef, useCallback } from 'react'
import type { PlayerProps } from '../../types/player'

declare global {
  interface Window {
    Twitch?: {
      Embed: TwitchEmbedConstructor
    }
  }
}

interface TwitchEmbedConstructor {
  new (
    elementId: string,
    options: Record<string, unknown>,
  ): TwitchEmbedInstance
  VIDEO_READY: string
  VIDEO_PLAY: string
}

interface TwitchEmbedInstance {
  addEventListener: (event: string, callback: () => void) => void
  getPlayer: () => TwitchPlayerInstance
  destroy: () => void
}

interface TwitchPlayerInstance {
  pause: () => void
  play: () => void
  addEventListener: (event: string, callback: () => void) => void
}

const TWITCH_EMBED_SCRIPT = 'https://embed.twitch.tv/embed/v1.js'
const EMBED_TIMEOUT_MS = 5000

// Player-level event names (fired on Twitch.Player from embed.getPlayer()).
// Per https://dev.twitch.tv/docs/embed/video-and-clips/ these are string
// constants on Twitch.Player; we hardcode the string values since the
// constructor surfaces them under the `Twitch.Player` global we do not
// import here (and the mock uses the same strings).
const PLAYER_EVT = {
  PAUSE: 'pause',
  PLAY: 'play',
  OFFLINE: 'offline',
  ONLINE: 'online',
  ENDED: 'ended',
  PLAYBACK_BLOCKED: 'playbackBlocked',
} as const

let scriptLoadPromise: Promise<void> | null = null

function loadTwitchScript(): Promise<void> {
  if (window.Twitch?.Embed) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      `script[src="${TWITCH_EMBED_SCRIPT}"]`,
    )
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () =>
        reject(new Error('Failed to load Twitch Embed SDK')),
      )
      return
    }

    const script = document.createElement('script')
    script.src = TWITCH_EMBED_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptLoadPromise = null
      reject(new Error('Failed to load Twitch Embed SDK'))
    }
    document.head.appendChild(script)
  })

  return scriptLoadPromise
}

export default function TwitchEmbedPlayer({
  url: _url, // eslint-disable-line @typescript-eslint/no-unused-vars
  detection,
  onReady,
  onError,
  onPlay,
  onPause,
  onOffline,
  onOnline,
  onEnded,
  onPlaybackBlocked,
}: PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const embedRef = useRef<TwitchEmbedInstance | null>(null)
  const playerRef = useRef<TwitchPlayerInstance | null>(null)
  const mountedRef = useRef(true)
  const embedIdRef = useRef('')

  const handleError = useCallback(
    (msg: string) => {
      if (mountedRef.current) onError?.(msg)
    },
    [onError],
  )

  useEffect(() => {
    mountedRef.current = true

    // Defensive guard: the Twitch JS SDK does not support clips.
    // If we're ever handed one, short-circuit so PlayerHost advances.
    if (detection.platform === 'twitch-clip') {
      handleError('Twitch SDK does not support clips — use iframe engine')
      return
    }

    const container = containerRef.current
    if (!container) return

    if (!embedIdRef.current) {
      embedIdRef.current = `twitch-embed-${Date.now()}-${Math.floor(
        Math.random() * 10000,
      )}`
    }
    const embedId = embedIdRef.current
    container.id = embedId

    // Start the timeout BEFORE async work so the 5s budget covers the full
    // init path (script load + Embed construction + VIDEO_READY).
    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => {
        if (mountedRef.current) {
          handleError('Twitch Embed timed out after 5s')
        }
      },
      EMBED_TIMEOUT_MS,
    )

    const clearTimeoutSafe = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
    }

    const init = async () => {
      try {
        await loadTwitchScript()
      } catch {
        clearTimeoutSafe()
        handleError('Failed to load Twitch Embed SDK')
        return
      }

      if (!mountedRef.current || !window.Twitch?.Embed) return

      const Embed = window.Twitch.Embed

      // Build options. `muted: true` is required for reliable autoplay under
      // browser policies. The real Twitch player still shows an unmute button.
      const options: Record<string, unknown> = {
        width: '100%',
        height: '100%',
        parent: [window.location.hostname],
        layout: 'video',
        autoplay: true,
        muted: true,
        allowfullscreen: true,
      }

      if (
        detection.platform === 'twitch-video' &&
        detection.metadata?.videoId
      ) {
        options.video = `v${detection.metadata.videoId}`
      } else if (
        detection.platform === 'twitch-stream' &&
        detection.metadata?.channelName
      ) {
        options.channel = detection.metadata.channelName
      } else {
        clearTimeoutSafe()
        handleError('Unable to determine Twitch content type')
        return
      }

      try {
        const embed = new Embed(embedId, options)
        embedRef.current = embed

        embed.addEventListener(Embed.VIDEO_READY, () => {
          if (!mountedRef.current) return
          clearTimeoutSafe()

          // Now that VIDEO_READY has fired, the underlying Player exists.
          // Attach the real event listeners to it.
          try {
            const player = embed.getPlayer()
            playerRef.current = player

            player.addEventListener(PLAYER_EVT.PAUSE, () => {
              if (mountedRef.current) onPause?.()
            })
            player.addEventListener(PLAYER_EVT.PLAY, () => {
              if (mountedRef.current) onPlay?.()
            })
            player.addEventListener(PLAYER_EVT.ENDED, () => {
              if (mountedRef.current) onEnded?.()
            })
            player.addEventListener(PLAYER_EVT.PLAYBACK_BLOCKED, () => {
              if (mountedRef.current) {
                onPlaybackBlocked?.()
                // Autoplay was blocked by the browser. Treat this as an error
                // so the host advances to the iframe engine (which also
                // requires a click, but at least the user knows).
                handleError('Autoplay blocked by browser')
              }
            })
            // OFFLINE / ONLINE are only meaningful for live streams.
            if (detection.platform === 'twitch-stream') {
              player.addEventListener(PLAYER_EVT.OFFLINE, () => {
                if (mountedRef.current) onOffline?.()
              })
              player.addEventListener(PLAYER_EVT.ONLINE, () => {
                if (mountedRef.current) onOnline?.()
              })
            }
          } catch {
            // Non-fatal: player-level events simply won't fire.
          }

          onReady?.()
        })

        // Embed-level VIDEO_PLAY also fires once on the first playthrough.
        // (The Player-level PLAY handles subsequent play-after-pause.)
        embed.addEventListener(Embed.VIDEO_PLAY, () => {
          if (mountedRef.current) onPlay?.()
        })
      } catch (err) {
        clearTimeoutSafe()
        handleError(
          `Twitch Embed initialization failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
    }

    init()

    return () => {
      mountedRef.current = false
      clearTimeoutSafe()
      try {
        embedRef.current?.destroy()
      } catch {
        // Swallow destroy errors
      }
      embedRef.current = null
      playerRef.current = null
      if (container) container.innerHTML = ''
    }
  }, [
    detection.platform,
    detection.metadata?.clipId,
    detection.metadata?.videoId,
    detection.metadata?.channelName,
    onReady,
    onPlay,
    onPause,
    onOffline,
    onOnline,
    onEnded,
    onPlaybackBlocked,
    handleError,
  ])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 300 }}
    />
  )
}
```

- [ ] **Step 2: Run the scaffolded tests to confirm no regressions**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- TwitchEmbedPlayer`
Expected: placeholder test still passes. (Behavior tests are added in Task 6.)

- [ ] **Step 3: Type-check**

Run: `cd C:/Dev/projects/twitch-glaze-me && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
rtk git add src/components/player/TwitchEmbedPlayer.tsx
rtk git commit -m "fix(player): wire real Twitch.Player events via getPlayer(), guard against clips"
```

---

## Task 6: Test coverage for `TwitchEmbedPlayer` behavior

**Files:**
- Test: `src/components/player/__tests__/TwitchEmbedPlayer.test.tsx`

- [ ] **Step 1: Append behavior tests inside the existing `describe('TwitchEmbedPlayer', ...)` block**

Remove the placeholder `it('placeholder — harness compiles', ...)` and add:

```tsx
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

  it('fires onError after 5s if VIDEO_READY never arrives', async () => {
    const onError = vi.fn()
    render(
      <TwitchEmbedPlayer
        url={streamDetection.originalUrl}
        detection={streamDetection}
        onError={onError}
      />,
    )
    await vi.runAllTimersAsync()
    expect(onError).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5000)
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
    )
  })

  it('does NOT fire onError after VIDEO_READY even if 5s elapses', async () => {
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
    await vi.runAllTimersAsync()
    embedInstances[0].__fire('video.ready')
    vi.advanceTimersByTime(10000)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(onError).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run tests**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- TwitchEmbedPlayer`
Expected: all 12 behavior tests pass.

- [ ] **Step 3: Commit**

```bash
rtk git add src/components/player/__tests__/TwitchEmbedPlayer.test.tsx
rtk git commit -m "test(player): cover clip guard, muted autoplay, getPlayer event wiring, timeout"
```

---

## Task 7: Test harness for `PlayerHost`

**Files:**
- Create: `src/components/player/__tests__/PlayerHost.test.tsx`

- [ ] **Step 1: Write the harness**

Create `src/components/player/__tests__/PlayerHost.test.tsx`:

```tsx
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PlayerHost from '../PlayerHost'
import { AppProvider } from '../../../contexts/AppContext'
import type { URLDetectionResult } from '../../../lib/urlDetection'
import type { PlayerProps } from '../../../types/player'

// Capture props passed to each mocked player so tests can drive the callbacks.
const sdkProps: PlayerProps[] = []
const iframeProps: PlayerProps[] = []

vi.mock('../TwitchEmbedPlayer', () => ({
  default: (props: PlayerProps) => {
    sdkProps.push(props)
    return <div data-testid="mock-twitch-sdk" />
  },
}))

vi.mock('../TwitchIframePlayer', () => ({
  default: (props: PlayerProps) => {
    iframeProps.push(props)
    return <div data-testid="mock-twitch-iframe" />
  },
}))

vi.mock('../YouTubePlayer', () => ({
  default: () => <div data-testid="mock-youtube" />,
}))

vi.mock('../VideoJSPlayer', () => ({
  default: () => <div data-testid="mock-videojs" />,
}))

vi.mock('../DashJSPlayer', () => ({
  default: () => <div data-testid="mock-dashjs" />,
}))

const streamDetection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-stream',
  originalUrl: 'https://twitch.tv/ninja',
  playableUrl: 'https://twitch.tv/ninja',
  metadata: { channelName: 'ninja' },
}

const clipDetection: URLDetectionResult = {
  type: 'twitch',
  platform: 'twitch-clip',
  originalUrl: 'https://clips.twitch.tv/AbcDef123',
  playableUrl: 'https://clips.twitch.tv/AbcDef123',
  metadata: { clipId: 'AbcDef123' },
}

function renderHost(detection = streamDetection) {
  return render(
    <AppProvider>
      <PlayerHost url={detection.originalUrl} detection={detection} />
    </AppProvider>,
  )
}

describe('PlayerHost', () => {
  beforeEach(() => {
    sdkProps.length = 0
    iframeProps.length = 0
  })

  afterEach(() => {
    cleanup()
  })

  it('starts on the SDK engine for stream detection', async () => {
    renderHost(streamDetection)
    expect(await screen.findByTestId('mock-twitch-sdk')).toBeInTheDocument()
  })

  it('starts on the iframe engine for clip detection (SDK skipped)', async () => {
    renderHost(clipDetection)
    expect(await screen.findByTestId('mock-twitch-iframe')).toBeInTheDocument()
    expect(screen.queryByTestId('mock-twitch-sdk')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run harness tests**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- PlayerHost`
Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
rtk git add src/components/player/__tests__/PlayerHost.test.tsx
rtk git commit -m "test(player): scaffold PlayerHost harness covering clip vs stream chain start"
```

---

## Task 8: Rewrite `PlayerHost` — offline overlay, debug overlay improvements, force-advance/retry

**Files:**
- Modify: `src/components/player/PlayerHost.tsx`
- Test: `src/components/player/__tests__/PlayerHost.test.tsx`

- [ ] **Step 1: Write failing tests for the new behaviors**

Append inside `describe('PlayerHost', ...)`:

```tsx
  it('shows offline overlay when the SDK player reports onOffline', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    expect(props.onOffline).toBeDefined()
    props.onOffline!()
    expect(await screen.findByText(/is offline/i)).toBeInTheDocument()
    expect(screen.getByText(/ninja/i)).toBeInTheDocument()
    // SDK stays mounted underneath so ONLINE can re-trigger it
    expect(screen.getByTestId('mock-twitch-sdk')).toBeInTheDocument()
  })

  it('clears offline overlay when SDK player reports onOnline', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    props.onOffline!()
    expect(await screen.findByText(/is offline/i)).toBeInTheDocument()
    props.onOnline!()
    expect(screen.queryByText(/is offline/i)).not.toBeInTheDocument()
  })

  it('does NOT advance the fallback chain on offline (iframe not mounted)', async () => {
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    props.onOffline!()
    expect(screen.queryByTestId('mock-twitch-iframe')).not.toBeInTheDocument()
  })

  it('shows Content ID and Parent rows in debug overlay', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await user.click(screen.getByLabelText('Toggle debug overlay'))
    const contentRow = screen.getByText(/Content ID:/i).parentElement
    expect(contentRow?.textContent).toMatch(/ninja/)
    expect(screen.getByText(/Parent:/i)).toBeInTheDocument()
  })

  it('force-advance button advances from SDK to iframe', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await user.click(screen.getByLabelText('Toggle debug overlay'))
    await user.click(screen.getByLabelText('Force advance fallback chain'))
    expect(await screen.findByTestId('mock-twitch-iframe')).toBeInTheDocument()
  })

  it('retry-from-start resets to the recommended engine', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    await user.click(screen.getByLabelText('Toggle debug overlay'))
    await user.click(screen.getByLabelText('Force advance fallback chain'))
    await user.click(screen.getByLabelText('Force advance fallback chain'))
    await user.click(
      screen.getByLabelText('Retry from start of fallback chain'),
    )
    expect(await screen.findByTestId('mock-twitch-sdk')).toBeInTheDocument()
  })

  it('retry-from-start also clears the offline overlay', async () => {
    const user = userEvent.setup()
    renderHost(streamDetection)
    await screen.findByTestId('mock-twitch-sdk')
    const props = sdkProps[sdkProps.length - 1]
    props.onOffline!()
    expect(await screen.findByText(/is offline/i)).toBeInTheDocument()
    await user.click(screen.getByLabelText('Toggle debug overlay'))
    await user.click(
      screen.getByLabelText('Retry from start of fallback chain'),
    )
    expect(screen.queryByText(/is offline/i)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- PlayerHost`
Expected: the 7 new tests FAIL (`onOffline` is undefined, debug overlay lacks Content ID row, etc.).

- [ ] **Step 3: Replace `src/components/player/PlayerHost.tsx` contents**

```tsx
import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { Settings, WifiOff } from 'lucide-react'
import type { URLDetectionResult, PlayerEngine } from '../../lib/urlDetection'
import {
  getRecommendedEngine,
  getURLTypeDisplayName,
} from '../../lib/urlDetection'
import type { PlayerProps } from '../../types/player'
import { useApp } from '../../contexts/AppContext'
import FallbackCard from './FallbackCard'

const TwitchEmbedPlayer = lazy(() => import('./TwitchEmbedPlayer'))
const TwitchIframePlayer = lazy(() => import('./TwitchIframePlayer'))
const VideoJSPlayer = lazy(() => import('./VideoJSPlayer'))
const DashJSPlayer = lazy(() => import('./DashJSPlayer'))
const YouTubePlayer = lazy(() => import('./YouTubePlayer'))

interface PlayerHostProps {
  url: string
  detection: URLDetectionResult
}

const PLAYER_LOADING_FALLBACK = (
  <div
    className="flex items-center justify-center w-full h-full"
    style={{ minHeight: 300, backgroundColor: 'var(--bg-card)' }}
  >
    <div
      className="animate-pulse text-sm"
      style={{ color: 'var(--text-muted)' }}
    >
      Loading player...
    </div>
  </div>
)

function getFallbackChain(detection: URLDetectionResult): PlayerEngine[] {
  switch (detection.type) {
    case 'twitch':
      return detection.platform === 'twitch-clip'
        ? ['twitch-iframe', 'fallback']
        : ['twitch-sdk', 'twitch-iframe', 'fallback']
    case 'youtube':
      return ['reactplayer', 'fallback']
    case 'hls':
    case 'mp4':
      return ['videojs', 'fallback']
    case 'dash':
      return ['dashjs', 'fallback']
    default:
      return ['fallback']
  }
}

function getContentId(detection: URLDetectionResult): string | null {
  return (
    detection.metadata?.clipId ??
    detection.metadata?.videoId ??
    detection.metadata?.channelName ??
    null
  )
}

export default function PlayerHost({ url, detection }: PlayerHostProps) {
  const { state, dispatch } = useApp()
  const { debugMode } = state.player

  const chain = getFallbackChain(detection)
  const initialEngine = getRecommendedEngine(detection)

  const [fallbackStep, setFallbackStep] = useState(0)
  const [activeEngine, setActiveEngine] = useState<PlayerEngine>(initialEngine)
  const [errorReason, setErrorReason] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [lastTransitionAt, setLastTransitionAt] = useState<number>(() =>
    Date.now(),
  )

  useEffect(() => {
    const engine = getRecommendedEngine(detection)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on prop change
    setFallbackStep(0)
    setActiveEngine(engine)
    setErrorReason(null)
    setIsOffline(false)
    setLastTransitionAt(Date.now())
    dispatch({ type: 'SET_ENGINE', engine, fallbackStep: 0 })
  }, [url, detection, dispatch])

  const advanceFallback = useCallback(
    (error: string) => {
      const nextStep = fallbackStep + 1
      setLastTransitionAt(Date.now())
      if (nextStep < chain.length) {
        const nextEngine = chain[nextStep]
        setFallbackStep(nextStep)
        setActiveEngine(nextEngine)
        setErrorReason(error)
        dispatch({
          type: 'SET_ENGINE',
          engine: nextEngine,
          fallbackStep: nextStep,
        })
      } else {
        setActiveEngine('fallback')
        setErrorReason(error)
        dispatch({
          type: 'SET_ENGINE',
          engine: 'fallback',
          fallbackStep: nextStep,
        })
      }
    },
    [fallbackStep, chain, dispatch],
  )

  const resetChain = useCallback(() => {
    const engine = getRecommendedEngine(detection)
    setFallbackStep(0)
    setActiveEngine(engine)
    setErrorReason(null)
    setIsOffline(false)
    setLastTransitionAt(Date.now())
    dispatch({ type: 'SET_ENGINE', engine, fallbackStep: 0 })
  }, [detection, dispatch])

  const handleReady = useCallback(() => {
    setErrorReason(null)
  }, [])

  const handleError = useCallback(
    (error: string) => advanceFallback(error),
    [advanceFallback],
  )

  const handleOffline = useCallback(() => {
    setIsOffline(true)
    setLastTransitionAt(Date.now())
  }, [])

  const handleOnline = useCallback(() => {
    setIsOffline(false)
    setLastTransitionAt(Date.now())
  }, [])

  const toggleDebug = useCallback(() => {
    dispatch({ type: 'TOGGLE_DEBUG' })
  }, [dispatch])

  const playerProps: PlayerProps = {
    url,
    detection,
    onReady: handleReady,
    onError: handleError,
    onOffline: handleOffline,
    onOnline: handleOnline,
  }

  const renderPlayer = () => {
    switch (activeEngine) {
      case 'twitch-sdk':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <TwitchEmbedPlayer {...playerProps} />
          </Suspense>
        )
      case 'twitch-iframe':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <TwitchIframePlayer {...playerProps} />
          </Suspense>
        )
      case 'videojs':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <VideoJSPlayer {...playerProps} />
          </Suspense>
        )
      case 'dashjs':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <DashJSPlayer {...playerProps} />
          </Suspense>
        )
      case 'reactplayer':
        return (
          <Suspense fallback={PLAYER_LOADING_FALLBACK}>
            <YouTubePlayer {...playerProps} />
          </Suspense>
        )
      case 'fallback':
      default:
        return <FallbackCard detection={detection} error={errorReason} />
    }
  }

  const contentId = getContentId(detection)
  const parentHost =
    typeof window !== 'undefined' ? window.location.hostname : 'unknown'

  return (
    <div className="relative w-full h-full">
      {renderPlayer()}

      {isOffline && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{
            // Solid-enough dark overlay; no backdrop-filter (Law 6: no
            // decorative glassmorphism — at this opacity blur does nothing).
            backgroundColor: 'rgba(0, 0, 0, 0.92)',
          }}
          role="status"
          aria-live="polite"
        >
          <WifiOff size={40} style={{ color: 'var(--accent-twitch)' }} />
          <div>
            <h3
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              {/* Generic across players: channels, YouTube Live, HLS live streams. */}
              {getContentId(detection) ?? 'Channel'} is offline
            </h3>
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--text-muted)' }}
            >
              We&apos;ll auto-resume when the stream goes live.
            </p>
          </div>
        </div>
      )}

      <button
        onClick={toggleDebug}
        className="absolute bottom-2 right-2 z-20 p-1.5 rounded-md transition-colors duration-150 hover:bg-white/10"
        style={{
          color: debugMode ? 'var(--accent-green)' : 'var(--text-muted)',
        }}
        title="Toggle debug overlay"
        aria-label="Toggle debug overlay"
      >
        <Settings size={16} />
      </button>

      {debugMode && (
        <div
          className="absolute bottom-10 right-2 z-20 p-3 rounded-lg text-xs space-y-1 max-w-xs"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            border: '1px solid var(--border-accent)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-secondary)',
          }}
        >
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Engine: </span>
            <span style={{ color: 'var(--accent-green)' }}>{activeEngine}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Fallback: </span>
            <span>
              step {fallbackStep} / {chain.length - 1}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Type: </span>
            <span>{getURLTypeDisplayName(detection)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Content ID: </span>
            <span>{contentId ?? '(none)'}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Parent: </span>
            <span>{parentHost}</span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Offline: </span>
            <span
              style={{
                color: isOffline
                  ? 'var(--accent-twitch)'
                  : 'var(--text-muted)',
              }}
            >
              {isOffline ? 'yes' : 'no'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Last change: </span>
            <span>
              {new Date(lastTransitionAt).toISOString().slice(11, 19)}
            </span>
          </div>
          {errorReason && (
            <div>
              <span style={{ color: 'var(--accent-red)' }}>Error: </span>
              <span className="break-words">{errorReason}</span>
            </div>
          )}
          <div className="pt-1 border-t border-white/10">
            <span style={{ color: 'var(--text-muted)' }}>Chain: </span>
            <span>
              {chain.map((e, i) => (
                <span
                  key={e}
                  style={{
                    color:
                      i === fallbackStep
                        ? 'var(--accent-green)'
                        : i < fallbackStep
                          ? 'var(--accent-red)'
                          : 'var(--text-muted)',
                  }}
                >
                  {i > 0 && ' > '}
                  {e}
                </span>
              ))}
            </span>
          </div>
          <div className="pt-2 flex gap-2 border-t border-white/10">
            <button
              onClick={() => advanceFallback('manual debug advance')}
              className="px-2 py-1 rounded text-xs hover:bg-white/10"
              style={{
                border: '1px solid var(--border-accent)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Force advance fallback chain"
            >
              Force advance →
            </button>
            <button
              onClick={resetChain}
              className="px-2 py-1 rounded text-xs hover:bg-white/10"
              style={{
                border: '1px solid var(--border-accent)',
                color: 'var(--text-secondary)',
              }}
              aria-label="Retry from start of fallback chain"
            >
              Retry from start
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test -- PlayerHost`
Expected: all 9 PlayerHost tests pass (2 harness + 7 new behavior).

- [ ] **Step 5: Commit**

```bash
rtk git add src/components/player/PlayerHost.tsx src/components/player/__tests__/PlayerHost.test.tsx
rtk git commit -m "feat(player): offline overlay + debug overlay with content-id/parent/force-advance/retry"
```

---

## Task 9: Manual test checklist with cloudflared tunnel prerequisite

**Files:**
- Create: `docs/manual-test-twitch-player.md`

- [ ] **Step 1: Write the checklist**

Create `docs/manual-test-twitch-player.md`:

````markdown
# Twitch Player — Manual Test Checklist

## Prerequisite: Cloudflared HTTPS tunnel

**Twitch embeds do not work on localhost:5173.** The Twitch SDK assumes port 80
for `parent=localhost` with no override, so any Vite dev server on a non-80 port
silently fails to render embeds. To manual-test locally, run a Cloudflared
tunnel that exposes Vite on a real HTTPS hostname.

Install (one-time):

```bash
# Windows (winget)
winget install --id Cloudflare.cloudflared
# macOS
brew install cloudflared
```

Run before each manual test session (two terminals):

```bash
# Terminal 1 — start Vite
cd C:/Dev/projects/twitch-glaze-me
npm run dev

# Terminal 2 — tunnel Vite to an https URL
cloudflared tunnel --url http://localhost:5173
```

Cloudflared prints an `https://<random>.trycloudflare.com` URL. Open THAT URL
in your browser, not `localhost:5173`. Embeds will now receive a matching
`parent=<random>.trycloudflare.com` and load correctly.

> Alternative: push the branch and test against the GitHub Pages deploy
> (`https://nooROtic.github.io/twitch-glaze-me/`). Slower iteration.

---

## Test matrix

Replace the placeholder URLs with currently-valid ones before testing.

| # | URL type        | Example                                  | Expected engine  | Expected state                                         |
|---|-----------------|------------------------------------------|------------------|--------------------------------------------------------|
| 1 | Clip            | `https://clips.twitch.tv/<slug>`         | `twitch-iframe`  | Clip plays, `Content ID: <slug>`, chain starts at iframe |
| 2 | VOD             | `https://twitch.tv/videos/<id>`          | `twitch-sdk`     | VOD plays, `Content ID: <id>`                          |
| 3 | Live stream     | `https://twitch.tv/<live-channel>`       | `twitch-sdk`     | Stream plays, `Content ID: <channel>`, Offline: no     |
| 4 | Offline channel | `https://twitch.tv/<offline-channel>`    | `twitch-sdk`     | Offline overlay shown, Offline: yes, chain NOT advanced |
| 5 | Malformed       | `https://twitch.tv/`                     | `fallback`       | FallbackCard with "Open Link"                          |

## For each test

- [ ] Engine in debug overlay matches the "Expected engine" column
- [ ] Content ID matches (streams → channel, clips → slug, VODs → numeric id)
- [ ] `Parent:` row shows the cloudflared hostname
- [ ] No console errors

## Specific behaviors

- [ ] **Test 1 — clip skips SDK**: Debug overlay should show `Chain: twitch-iframe > fallback` (two steps, not three). It should NEVER show `twitch-sdk`.
- [ ] **Test 4 — offline overlay**: The "Channel is offline" card appears over the player. The Twitch SDK remains mounted underneath — inspect DOM: `<div id="twitch-embed-*">` still present.
- [ ] **Test 4 — no chain advance on offline**: Debug overlay shows `Fallback: step 0 / 2`. It must NOT have advanced to `twitch-iframe`.
- [ ] **Auto-recover (opportunistic)**: When an offline channel goes live, the overlay disappears and the stream begins playing without a refresh. (Hard to schedule; skip if no candidate channel.)
- [ ] **Force advance**: With debug overlay open on a working stream, click `Force advance →`. Engine switches to `twitch-iframe`; iframe loads; `step 1 / 2`. Click again → `fallback`; `step 2 / 2`.
- [ ] **Retry from start**: Click `Retry from start`. Engine resets to `twitch-sdk` for streams/VODs, or `twitch-iframe` for clips; `step 0`; offline flag cleared.
- [ ] **Script-load timeout** (optional, DevTools): Block `https://embed.twitch.tv/embed/v1.js` in DevTools Network. Reload with a stream URL. Within 5s the chain should advance to `twitch-iframe` with `Error: Twitch Embed timed out after 5s`.
- [ ] **PLAYBACK_BLOCKED handling** (optional, DevTools): Disable autoplay in browser settings. Load a stream URL. The chain should advance with `Error: Autoplay blocked by browser`.
- [ ] **Pause event**: Start a VOD, pause it. Open React DevTools and watch props on `PlayerHost` — `handlePause` should have been called. (No visible indicator in the UI yet.)

## Known limitations

- SDK and iframe both use `window.location.hostname` as `parent=`. If the SDK fails due to parent mismatch, the iframe fallback will fail the same way. Not independent failure modes.
- The iframe player can't detect a broken-embed scenario where the iframe loads but Twitch renders an error message inside it. The 5s timeout is our only signal.
- Clips don't fire offline/online events (they're static), so Test 1 will never exercise the offline overlay.
````

- [ ] **Step 2: Update `CLAUDE.md` to reflect the extended `PlayerProps` interface**

Edit `CLAUDE.md` line 11. Replace:

```
- Player components expose `{ onReady, onError, onPlay, onPause }` interface
```

With:

```
- Player components expose `{ onReady, onError, onPlay, onPause, onOffline, onOnline, onEnded, onPlaybackBlocked }` interface (all optional)
```

- [ ] **Step 3: Commit**

```bash
rtk git add docs/manual-test-twitch-player.md CLAUDE.md
rtk git commit -m "docs: manual test checklist + CLAUDE.md PlayerProps interface update"
```

---

## Task 10: Full regression run

**Files:** (none modified)

- [ ] **Step 1: Run the full test suite**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run test`
Expected: all pre-existing tests (108) + new tests from this plan (~25 added across urlDetection, TwitchEmbedPlayer, PlayerHost) all pass.

- [ ] **Step 2: Run lint**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run lint`
Expected: clean.

- [ ] **Step 3: Run formatter check**

Run: `cd C:/Dev/projects/twitch-glaze-me && npm run format`
Expected: clean. If changes needed, run `npm run format:fix` and commit.

- [ ] **Step 4: Manual smoke test via cloudflared**

Start Vite + cloudflared per the prerequisite section of `docs/manual-test-twitch-player.md`. Open the tunnel URL. Walk through the matrix. Do NOT mark the task complete until at least Tests 1, 3, and 4 pass (clip, live stream, offline channel).

- [ ] **Step 5: Follow-up commits (only if manual test found issues)**

If the browser pass surfaces bugs, commit fixes with `fix(player): ...` subjects. If everything passed clean, skip.

---

## Self-review checklist

- **Spec coverage** — design spec's "Twitch Embed JS SDK as primary with fallback chain" is now correctly implemented per the actual SDK capabilities (clips iframe-only, events attached to Player not Embed). The `OFFLINE/ONLINE` wiring that justified the SDK choice is finally real.
- **Placeholder scan** — no TBD/TODO/"similar to above"/"handle edge cases" language. Every code step contains complete code.
- **Type consistency** — `PlayerProps.onOffline/onOnline/onEnded/onPlaybackBlocked` introduced in Task 2, consumed in Task 5 (TwitchEmbedPlayer), passed through in Task 8 (PlayerHost). Naming consistent.
- **Task ordering** — Task 1 (urlDetection) has no prerequisites. Task 2 (types) must precede 5 and 8. Task 3 (chain split) is a small pre-edit so Task 7's harness tests start correctly. Tasks 4+5+6 form the TwitchEmbedPlayer TDD pair. Tasks 7+8 form the PlayerHost TDD pair. Task 9 is independent. Task 10 is last.
- **Research-driven corrections applied**:
  - Clip iframe URL now uses `clips.twitch.tv/embed` (Task 1).
  - Clip recommended engine is `twitch-iframe`, not `twitch-sdk` (Task 1).
  - Clip fallback chain is 2-step, not 3-step (Task 3).
  - `TwitchEmbedPlayer` defensively guards against clips (Task 5).
  - All pause/play/offline/online/ended/playback_blocked listeners attach to `embed.getPlayer()`, not the Embed (Task 5).
  - `muted: true` added to Embed options for autoplay reliability (Task 5).
  - Cloudflared tunnel documented as manual-test prerequisite (Task 9).
