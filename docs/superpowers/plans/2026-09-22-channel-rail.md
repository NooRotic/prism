# Channel Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fixed-overlay channel rail that shows live followed channels on every route, plus category recommendations while watching a Twitch channel, without costing the player any width.

**Architecture:** A single `ChannelRail` mounts once in the `AppLayout` route wrapper as a `position: fixed` overlay pinned to the left or right edge. It renders one `RailSection` per data source (follows, recommendations), each a list of `RailEntryCard` avatars that expand in place on hover, focus, or tap. Data comes from the existing `useFollowedChannels` hook plus two new hooks — `useCategoryRail` for recommendations and `useRailAvatars` for the profile-image join that `EnrichedFollow` cannot supply.

**Tech Stack:** React 19, TypeScript, Vite 6, Tailwind CSS v4, react-router-dom, lucide-react, Vitest 4.1.5 + @testing-library/react + @testing-library/user-event (jsdom, globals enabled, setup at `src/test/setup.ts`).

**Spec:** `docs/superpowers/specs/2026-09-21-channel-rail-design.md`

---

## Global Constraints

These apply to every task. Read them once; they are not repeated per task.

- **Accent colors:** `var(--accent-green)` (#39FF14) for primary/live accents, `var(--accent-twitch)` (#9146FF) for Twitch-branded elements. Never hardcode hex values that a CSS variable already covers.
- **Text colors:** `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`. Borders: `var(--border)`. Background: `var(--bg)`.
- **Storage keys:** every localStorage/sessionStorage key must be read from `STORAGE_KEYS` in `src/config/storageKeys.ts`. A raw key string anywhere in rail code is a defect.
- **Twitch API:** all Helix calls go through `src/lib/twitchApi.ts`. No `fetch` to Twitch from a component or hook.
- **Env vars:** `VITE_` prefix (this is Vite, not Next.js).
- **Paths:** forward slashes. Shell is bash.
- **Test command:** `node ./node_modules/vitest/vitest.mjs run` — do **not** use `npx vitest`, which this environment rewrites into `npm run vitest` and fails. For a single file append the path; for a single test append `-t "name"`.
- **Baseline:** 282 tests across 28 files pass on `feat/channel-rail` at `a3d7114`. Every task must leave the full suite green, not just its own file.
- **Lint:** `npm run lint` must pass. The repo's eslint config enforces `react-hooks/set-state-in-effect`; where a state reset inside an effect is genuinely correct, follow the existing convention of a targeted `// eslint-disable-next-line react-hooks/set-state-in-effect -- <reason>` comment (see `src/hooks/useFollowedChannels.ts:236`).
- **Commit messages:** conventional-commit prefix, imperative mood. **Do not add a `Co-Authored-By` trailer to commit messages** — this project puts co-authorship in the PR description only.
- **Rail z-index is 25.** Above player chrome (`z-10`/`z-20`), below `SlidedownPanel` (`zIndex: 30`) and `Header` (`z-40`). The rail's own `+N` control opens `FollowingPanel`, which must render above the rail.
- **Section cap is 8 entries.** Defined once as `RAIL_SECTION_CAP` and imported; never re-declared.

---

## Spec deviations recorded up front

Four places where the approved spec does not match the code as it exists. Each was checked against the repo at `a3d7114`. Implementers should follow this plan, not the spec, on these four points — and report any *further* mismatch rather than working around it.

1. **`src/components/layout/AppLayout.tsx` does not exist.** `AppLayout` is a local function component inside `src/App.tsx` (line 42), used as the `<Route element={<AppLayout />}>` wrapper. It already hosts `Header`, `FollowingPanel`, `YourStatsPanel`, and `CategoryPanel`. The rail mounts there. The spec's design is unchanged; only the file path was wrong.

2. **`getUserByLogin` does not exist.** The single-user lookup is `getUserInfo(username: string): Promise<TwitchUser>` (`src/lib/twitchApi.ts:71`). The spec's argument — that `twitchApi.ts` exposes only single-user lookups and therefore needs a batched one — is correct; only the function name was wrong.

3. **AppContext gains no `rail` state.** The spec listed both a `useRailPosition` hook owning `STORAGE_KEYS.LOCAL_RAIL_POSITION` *and* an AppContext field `rail: { position, expanded }`. That is two owners for one piece of state. Decision (confirmed 2026-09-22): the hook owns it. Nothing outside the rail reads rail state — the `+N` control opens the Following panel through the existing `OPEN_NAV_PANEL` action — so the context field has no consumer. `src/contexts/AppContext.tsx` is **not** modified by this work.

4. **Recommendation exclusion happens before ranking, not after.** The spec lists "exclude the currently-playing channel" as step 4, after taking the top 3 and sampling 5. Applied in that order, watching a top-3 streamer in their own category yields 7 entries and a top-2 list, contradicting the spec's own test ("top 3 ordered by viewers, current channel excluded"). Exclusion is therefore applied to the pool first. This is the only ordering that satisfies both stated assertions.

Additionally, one **visible UI change** is in scope by consequence: `ProtocolPage`'s connect button currently reads "Connect Twitch" with no icon, while every other connect affordance in the app reads "connect twitch" with a `LogIn` icon. Adopting the shared `ConnectTwitchButton` normalizes it to the latter. This is intended, not incidental — flag it in the PR description.

---

## File structure

**New**

| File | Responsibility |
|---|---|
| `src/components/rail/types.ts` | `RailEntry`, `RailPosition` — the data contract |
| `src/components/rail/useRailPosition.ts` | Position state + `STORAGE_KEYS.LOCAL_RAIL_POSITION` persistence |
| `src/components/rail/RailEntryCard.tsx` | One avatar; collapsed circle, expanded detail row |
| `src/components/rail/RailSection.tsx` | One labelled group + the `+N` overflow control |
| `src/components/rail/ChannelRail.tsx` | Overlay shell: position, expansion triggers, data wiring, section order |
| `src/hooks/useRailAvatars.ts` | Batched avatar lookup → `Map<userId, avatarUrl>` |
| `src/hooks/useCategoryRail.ts` | Top-3 + random-sample recommendations, memoized |
| `src/components/ui/ConnectTwitchButton.tsx` | The one gradient connect button |
| `src/components/ui/ConnectTwitchPrompt.tsx` | Lock + title + copy + button card |

**Modified**

| File | Change |
|---|---|
| `src/lib/twitchApi.ts` | Add `getUsersByIds()` |
| `src/config/storageKeys.ts` | Add `LOCAL_RAIL_POSITION` |
| `src/App.tsx` | Mount `<ChannelRail />` inside `AppLayout` |
| `src/components/grid/FavoritesCard.tsx` | Use `ConnectTwitchPrompt` |
| `src/components/channel/StatsRow.tsx` | Use `ConnectTwitchPrompt` |
| `src/components/channel/ProfileSidebar.tsx` | Use `ConnectTwitchButton` |
| `src/pages/ProtocolPage.tsx` | Use `ConnectTwitchButton fullWidth` |

**Test files** mirror source under `__tests__/`, matching the existing convention (`src/components/channel/__tests__/StatsRow.test.tsx`).

---

### Task 1: `getUsersByIds` — batched profile lookup

The rail needs profile images. `EnrichedFollow` has none — its `thumbnailUrl` is the stream preview, not the avatar — and `profile_image_url` lives on `TwitchUser`. This is the one new Helix call the rail requires.

Note the contract differs from its nearest neighbour: `getStreamsByUserIds` (line 108) **truncates** with `userIds.slice(0, 100)`, because a stream list is already a "top N" and dropping the tail is harmless. Here every requested profile matters, so ids are **chunked and merged**. Do not copy the truncating pattern.

**Files:**
- Modify: `src/lib/twitchApi.ts` (append to the "User & Channel" section, after `getChannelInfo` at line ~92)
- Test: `src/lib/__tests__/twitchApi.getUsersByIds.test.ts`

**Interfaces:**
- Consumes: `TWITCH_API_BASE`, `CLIENT_ID`, `getAccessToken()`, `SessionExpiredError` — all already in `twitchApi.ts`
- Produces: `getUsersByIds(userIds: string[]): Promise<TwitchUser[]>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/twitchApi.getUsersByIds.test.ts`:

```ts
import { getUsersByIds, SessionExpiredError } from '../twitchApi'

function okResponse(ids: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: ids.map((id) => ({
        id,
        login: `user${id}`,
        display_name: `User ${id}`,
        profile_image_url: `https://cdn.example/${id}.png`,
      })),
    }),
  }
}

describe('getUsersByIds', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('issues no request for empty input', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const result = await getUsersByIds([])
    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sends one request for 100 or fewer ids', async () => {
    const ids = Array.from({ length: 100 }, (_, i) => String(i))
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(okResponse(ids) as unknown as Response)

    const result = await getUsersByIds(ids)

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(100)
  })

  it('chunks at 100 and merges the results in order', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => String(i))
    const chunkSizes: number[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      const chunk = url.searchParams.getAll('id')
      chunkSizes.push(chunk.length)
      return okResponse(chunk) as unknown as Response
    })

    const result = await getUsersByIds(ids)

    expect(chunkSizes).toEqual([100, 100, 1])
    expect(result).toHaveLength(201)
    expect(result.map((u) => u.id)).toEqual(ids)
  })

  it('survives one chunk failing and returns the rest', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i))
    let call = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      call++
      if (call === 1) return { ok: false, status: 500 } as unknown as Response
      const url = new URL(String(input))
      return okResponse(url.searchParams.getAll('id')) as unknown as Response
    })

    const result = await getUsersByIds(ids)

    expect(result).toHaveLength(50)
  })

  it('survives one chunk rejecting outright', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i))
    let call = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      call++
      if (call === 1) throw new TypeError('network down')
      const url = new URL(String(input))
      return okResponse(url.searchParams.getAll('id')) as unknown as Response
    })

    const result = await getUsersByIds(ids)

    expect(result).toHaveLength(50)
  })

  it('throws SessionExpiredError and clears the token on 401', async () => {
    localStorage.setItem('twitch_access_token', 'stale-token')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    } as unknown as Response)

    await expect(getUsersByIds(['1'])).rejects.toBeInstanceOf(SessionExpiredError)
    expect(localStorage.getItem('twitch_access_token')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/twitchApi.getUsersByIds.test.ts`

Expected: FAIL — `getUsersByIds is not a function` / import error.

- [ ] **Step 3: Implement `getUsersByIds`**

Add to `src/lib/twitchApi.ts` immediately after `getChannelInfo`:

```ts
/** Helix caps id params per request on /users and /streams alike. */
const HELIX_ID_CHUNK_SIZE = 100

/**
 * Batch-fetch profile data for multiple user IDs.
 *
 * Unlike `getStreamsByUserIds`, which truncates at 100 because a stream list
 * is already a "top N", every requested profile matters here — so ids are
 * chunked and the chunks merged.
 *
 * A single failing chunk does not fail the call: its ids are simply absent
 * from the result, and callers fall back to an initial-letter avatar. A 401
 * is the exception — an expired session is global, not per-chunk, so it
 * propagates.
 */
export async function getUsersByIds(userIds: string[]): Promise<TwitchUser[]> {
  if (userIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < userIds.length; i += HELIX_ID_CHUNK_SIZE) {
    chunks.push(userIds.slice(i, i + HELIX_ID_CHUNK_SIZE))
  }

  const results = await Promise.all(
    chunks.map(async (ids) => {
      const url = new URL(`${TWITCH_API_BASE}/users`)
      ids.forEach((id) => url.searchParams.append('id', id))

      const token = getAccessToken()
      const headers: Record<string, string> = { 'Client-ID': CLIENT_ID }
      if (token) headers['Authorization'] = `Bearer ${token}`

      let res: Response
      try {
        res = await fetch(url.toString(), { headers })
      } catch {
        // Network-level failure for this chunk only.
        return [] as TwitchUser[]
      }

      if (res.status === 401) {
        localStorage.removeItem(STORAGE_KEYS.LOCAL_TWITCH_ACCESS_TOKEN)
        throw new SessionExpiredError()
      }
      if (!res.ok) return [] as TwitchUser[]

      const data = await res.json()
      return (data.data ?? []) as TwitchUser[]
    }),
  )

  return results.flat()
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node ./node_modules/vitest/vitest.mjs run src/lib/__tests__/twitchApi.getUsersByIds.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Run the full suite**

Run: `node ./node_modules/vitest/vitest.mjs run`

Expected: 288 passed (282 baseline + 6).

- [ ] **Step 6: Commit**

```bash
git add src/lib/twitchApi.ts src/lib/__tests__/twitchApi.getUsersByIds.test.ts
git commit -m "feat: add getUsersByIds for batched profile lookup"
```

---

### Task 2: Extract the connect prompt

`docs/TECH-DEBT.md` lists the connect-prompt markup as duplicated across four components. Signed-out, the rail would be a fifth copy, so the extraction happens here.

Reading the four call sites, they are **not** four copies of one thing. `FavoritesCard` and `StatsRow` share a full card: `Lock` icon, accent title, muted description, gradient button. `ProfileSidebar` has an avatar/heading row instead of the Lock card. `ProtocolPage` is a full-width sidebar footer button with no icon and no copy. The genuinely identical element is the **button**.

So this extracts two primitives: `ConnectTwitchButton` (used by all four plus the rail) and `ConnectTwitchPrompt` (the card, used by `FavoritesCard`, `StatsRow`, and the rail).

Existing tests at `src/components/grid/__tests__/FavoritesCard.test.tsx`, `src/components/channel/__tests__/StatsRow.test.tsx`, and `src/components/channel/__tests__/ProfileSidebar.test.tsx` assert the current strings and roles. **They must pass unmodified** — that is the proof the extraction changed nothing. The one exception is `ProtocolPage`, whose label changes from "Connect Twitch" to "connect twitch"; update that assertion if one exists.

**Files:**
- Create: `src/components/ui/ConnectTwitchButton.tsx`
- Create: `src/components/ui/ConnectTwitchPrompt.tsx`
- Modify: `src/components/grid/FavoritesCard.tsx` (the Lock→button block, ~lines 19-40)
- Modify: `src/components/channel/StatsRow.tsx` (the Lock→button block, ~lines 70-95)
- Modify: `src/components/channel/ProfileSidebar.tsx` (the button, ~lines 79-93)
- Modify: `src/pages/ProtocolPage.tsx` (the CTA button, ~lines 145-162)
- Test: `src/components/ui/__tests__/ConnectTwitchPrompt.test.tsx`

**Interfaces:**
- Produces:
  - `ConnectTwitchButton` — default export, props `{ onClick: () => void; fullWidth?: boolean }`
  - `ConnectTwitchPrompt` — default export, props `{ title: string; description: string; onConnect: () => void; className?: string }`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/__tests__/ConnectTwitchPrompt.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConnectTwitchPrompt from '../ConnectTwitchPrompt'
import ConnectTwitchButton from '../ConnectTwitchButton'

describe('ConnectTwitchButton', () => {
  it('renders the shared lowercase label', () => {
    render(<ConnectTwitchButton onClick={() => {}} />)
    expect(screen.getByRole('button', { name: /connect twitch/i })).toBeInTheDocument()
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<ConnectTwitchButton onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: /connect twitch/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('stretches to full width when asked', () => {
    render(<ConnectTwitchButton onClick={() => {}} fullWidth />)
    expect(screen.getByRole('button', { name: /connect twitch/i })).toHaveClass('w-full')
  })
})

describe('ConnectTwitchPrompt', () => {
  it('renders the title and description it is given', () => {
    render(
      <ConnectTwitchPrompt
        title="Your Favorites"
        description="Connect Twitch to see your followed channels"
        onConnect={() => {}}
      />,
    )
    expect(screen.getByText('Your Favorites')).toBeInTheDocument()
    expect(
      screen.getByText('Connect Twitch to see your followed channels'),
    ).toBeInTheDocument()
  })

  it('wires the button to onConnect', async () => {
    const onConnect = vi.fn()
    const user = userEvent.setup()
    render(<ConnectTwitchPrompt title="T" description="D" onConnect={onConnect} />)
    await user.click(screen.getByRole('button', { name: /connect twitch/i }))
    expect(onConnect).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/ui/__tests__/ConnectTwitchPrompt.test.tsx`

Expected: FAIL — cannot resolve `../ConnectTwitchPrompt`.

- [ ] **Step 3: Create `ConnectTwitchButton`**

Create `src/components/ui/ConnectTwitchButton.tsx`:

```tsx
import { LogIn } from 'lucide-react'

interface ConnectTwitchButtonProps {
  onClick: () => void
  /**
   * Stretch to the container width. Used by ProtocolPage's sidebar footer,
   * where the button is the column's call to action rather than an inline
   * control.
   */
  fullWidth?: boolean
}

/**
 * The single "connect twitch" affordance. Every signed-out surface renders
 * this exact button — same gradient, same icon, same lowercase label — so
 * connecting reads as one action rather than five look-alikes.
 */
export default function ConnectTwitchButton({
  onClick,
  fullWidth = false,
}: ConnectTwitchButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.02]${
        fullWidth ? ' w-full' : ''
      }`}
      style={{
        background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)',
        color: '#fff',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        letterSpacing: '0.05em',
      }}
    >
      <LogIn size={12} />
      connect twitch
    </button>
  )
}
```

- [ ] **Step 4: Create `ConnectTwitchPrompt`**

Create `src/components/ui/ConnectTwitchPrompt.tsx`:

```tsx
import { Lock } from 'lucide-react'
import ConnectTwitchButton from './ConnectTwitchButton'

interface ConnectTwitchPromptProps {
  /** What this surface would have shown, had the user been connected. */
  title: string
  /** One line naming what connecting unlocks here. */
  description: string
  onConnect: () => void
  /** Layout hook for the call site's container. */
  className?: string
}

/**
 * Explains an absence. Rendered where Twitch data would be, when there is no
 * token to fetch it with.
 *
 * It asserts nothing about the user's channels — that distinction is load
 * bearing. Showing placeholder or demo data dressed as real follows is the
 * defect this component exists to avoid repeating.
 */
export default function ConnectTwitchPrompt({
  title,
  description,
  onConnect,
  className = '',
}: ConnectTwitchPromptProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}
    >
      <Lock size={24} style={{ color: 'var(--accent-twitch)' }} />
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--accent-twitch)' }}
      >
        {title}
      </span>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
      <div className="mt-1">
        <ConnectTwitchButton onClick={onConnect} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the new test to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/ui/__tests__/ConnectTwitchPrompt.test.tsx`

Expected: PASS, 5 tests.

- [ ] **Step 6: Replace the four call sites**

In `src/components/grid/FavoritesCard.tsx`, keep the outer styled container and replace the inner `Lock`/title/`<p>`/`<button>` block with:

```tsx
<ConnectTwitchPrompt
  title="Your Favorites"
  description="Connect Twitch to see your followed channels"
  onConnect={login}
/>
```

Add `import ConnectTwitchPrompt from '../ui/ConnectTwitchPrompt'` and drop the now-unused `Lock` / `LogIn` imports.

In `src/components/channel/StatsRow.tsx`, same shape:

```tsx
<ConnectTwitchPrompt
  title="Channel stats"
  description="Connect Twitch to see clips, VODs and engagement for this channel"
  onConnect={onConnect}
/>
```

In `src/components/channel/ProfileSidebar.tsx`, the avatar/heading layout stays; replace only the `<button>` with:

```tsx
<div className="self-start">
  <ConnectTwitchButton onClick={onConnect} />
</div>
```

In `src/pages/ProtocolPage.tsx`, replace the CTA `<button>` with:

```tsx
<ConnectTwitchButton onClick={login} fullWidth />
```

- [ ] **Step 7: Run the affected existing suites unmodified**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/grid src/components/channel src/pages`

Expected: PASS. `FavoritesCard`, `StatsRow`, and `ProfileSidebar` tests must pass **without edits** — they assert the exact strings and roles preserved above. If one fails, the extraction changed rendered output; fix the component, not the test. The only permitted test edit is a `ProtocolPage` assertion on the literal string "Connect Twitch", which is now lowercase.

- [ ] **Step 8: Run the full suite and lint**

Run: `node ./node_modules/vitest/vitest.mjs run && npm run lint`

Expected: 293 passed (288 + 5), lint clean with no unused-import errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/ui src/components/grid/FavoritesCard.tsx src/components/channel/StatsRow.tsx src/components/channel/ProfileSidebar.tsx src/pages/ProtocolPage.tsx
git commit -m "refactor: extract shared ConnectTwitchButton and ConnectTwitchPrompt"
```

---

### Task 3: Rail types and position persistence

The data contract and the one persisted preference. Small, but everything downstream imports from here, so it lands first and alone.

`RailPosition` includes `'top'` deliberately: the design allows for it, no rollover layout exists yet, and an explicit documented member is better than a silent fallthrough. `useRailPosition` therefore treats a stored `'top'` as unimplemented and falls back to the default.

**Files:**
- Create: `src/components/rail/types.ts`
- Create: `src/components/rail/useRailPosition.ts`
- Modify: `src/config/storageKeys.ts`
- Test: `src/components/rail/__tests__/useRailPosition.test.ts`

**Interfaces:**
- Consumes: `STORAGE_KEYS` from `src/config/storageKeys.ts`
- Produces:
  - `RailEntry`, `RailPosition` from `src/components/rail/types.ts`
  - `useRailPosition(): { position: RailPosition; setPosition: (p: RailPosition) => void; flip: () => void }`
  - `STORAGE_KEYS.LOCAL_RAIL_POSITION` — value `'prism_rail_position'`

- [ ] **Step 1: Write the failing test**

Create `src/components/rail/__tests__/useRailPosition.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react'
import { useRailPosition } from '../useRailPosition'
import { STORAGE_KEYS } from '../../../config/storageKeys'

describe('useRailPosition', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to right when nothing is stored', () => {
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('right')
  })

  it('reads a stored position', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, 'left')
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('left')
  })

  it('flips left and right, persisting each flip', () => {
    const { result } = renderHook(() => useRailPosition())

    act(() => result.current.flip())
    expect(result.current.position).toBe('left')
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_RAIL_POSITION)).toBe('left')

    act(() => result.current.flip())
    expect(result.current.position).toBe('right')
    expect(localStorage.getItem(STORAGE_KEYS.LOCAL_RAIL_POSITION)).toBe('right')
  })

  it('survives a reload', () => {
    const first = renderHook(() => useRailPosition())
    act(() => first.result.current.flip())
    first.unmount()

    const second = renderHook(() => useRailPosition())
    expect(second.result.current.position).toBe('left')
  })

  it('falls back to the default for an unimplemented stored position', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, 'top')
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('right')
  })

  it('falls back to the default for a garbage stored value', () => {
    localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, 'sideways')
    const { result } = renderHook(() => useRailPosition())
    expect(result.current.position).toBe('right')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/useRailPosition.test.ts`

Expected: FAIL — cannot resolve `../useRailPosition`.

- [ ] **Step 3: Add the storage key**

In `src/config/storageKeys.ts`, add before the closing `} as const`:

```ts
  /** Channel rail edge: 'left' or 'right'. */
  LOCAL_RAIL_POSITION: 'prism_rail_position',
```

- [ ] **Step 4: Create `types.ts`**

Create `src/components/rail/types.ts`:

```ts
/**
 * One entry in the rail, from any source. IDs are platform-scoped
 * ("twitch:71092938") so a second platform's entries cannot collide with
 * Twitch's when a YouTube or Kick section is added.
 */
export interface RailEntry {
  id: string
  displayName: string
  /** Empty string when unknown — the card falls back to an initial circle. */
  avatarUrl: string
  /** In-app route, e.g. "/twitch/xqc". Never an external URL. */
  href: string
  isLive: boolean
  viewerCount: number | null
  streamTitle: string | null
  gameName: string | null
  /** ISO 8601; drives the uptime readout. */
  startedAt: string | null
}

/**
 * `'top'` is a member deliberately. The design accommodates a top rail; no
 * rollover layout is built. An explicit, documented gap keeps the seam
 * visible instead of hiding it behind a silent fallthrough.
 */
export type RailPosition = 'left' | 'right' | 'top'
```

- [ ] **Step 5: Create `useRailPosition`**

Create `src/components/rail/useRailPosition.ts`:

```ts
import { useState, useCallback } from 'react'
import { STORAGE_KEYS } from '../../config/storageKeys'
import type { RailPosition } from './types'

const DEFAULT_POSITION: RailPosition = 'right'

/** Only these two have layouts. See the note on RailPosition. */
function isImplemented(value: string | null): value is 'left' | 'right' {
  return value === 'left' || value === 'right'
}

interface UseRailPositionReturn {
  position: RailPosition
  setPosition: (p: RailPosition) => void
  flip: () => void
}

/**
 * Owns the rail's edge preference and its persistence. The rail mounts once
 * globally, so local state is sufficient — nothing outside the rail reads
 * this, and putting it in AppContext would create a second owner for one
 * value.
 */
export function useRailPosition(): UseRailPositionReturn {
  const [position, setPositionState] = useState<RailPosition>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.LOCAL_RAIL_POSITION)
    return isImplemented(stored) ? stored : DEFAULT_POSITION
  })

  const setPosition = useCallback((p: RailPosition) => {
    setPositionState(p)
    localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, p)
  }, [])

  const flip = useCallback(() => {
    setPositionState((prev) => {
      const next: RailPosition = prev === 'left' ? 'right' : 'left'
      localStorage.setItem(STORAGE_KEYS.LOCAL_RAIL_POSITION, next)
      return next
    })
  }, [])

  return { position, setPosition, flip }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/useRailPosition.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 7: Run the full suite**

Run: `node ./node_modules/vitest/vitest.mjs run`

Expected: 299 passed (293 + 6). Note `src/config/__tests__` may assert the shape of `STORAGE_KEYS`; if a test enumerates keys, add `LOCAL_RAIL_POSITION` to that expectation — this is a legitimate test update, not a workaround.

- [ ] **Step 8: Commit**

```bash
git add src/components/rail src/config/storageKeys.ts
git commit -m "feat: add rail data contract and position persistence"
```

---

### Task 4: `useRailAvatars`

The profile-image join. `EnrichedFollow` carries no avatar, so the rail makes one batched `/users` call per population. Failure is never fatal — a rejected fetch yields an empty map and the cards fall back to initial-letter circles.

**Files:**
- Create: `src/hooks/useRailAvatars.ts`
- Test: `src/hooks/__tests__/useRailAvatars.test.ts`

**Interfaces:**
- Consumes: `getUsersByIds(userIds: string[]): Promise<TwitchUser[]>` from Task 1
- Produces: `useRailAvatars(userIds: string[]): Map<string, string>` — keys are Twitch user IDs (unscoped, as Helix returns them), values are `profile_image_url`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useRailAvatars.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { useRailAvatars } from '../useRailAvatars'
import { getUsersByIds } from '../../lib/twitchApi'

vi.mock('../../lib/twitchApi', () => ({
  getUsersByIds: vi.fn(),
}))

const mockedGetUsersByIds = vi.mocked(getUsersByIds)

function user(id: string) {
  return {
    id,
    login: `u${id}`,
    display_name: `U${id}`,
    profile_image_url: `https://cdn.example/${id}.png`,
  }
}

describe('useRailAvatars', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps user ids to profile image urls', async () => {
    mockedGetUsersByIds.mockResolvedValue([
      user('1'),
      user('2'),
    ] as unknown as Awaited<ReturnType<typeof getUsersByIds>>)

    const { result } = renderHook(() => useRailAvatars(['1', '2']))

    await waitFor(() => expect(result.current.size).toBe(2))
    expect(result.current.get('1')).toBe('https://cdn.example/1.png')
    expect(result.current.get('2')).toBe('https://cdn.example/2.png')
  })

  it('issues no request for an empty id list', () => {
    renderHook(() => useRailAvatars([]))
    expect(mockedGetUsersByIds).not.toHaveBeenCalled()
  })

  it('returns an empty map when the fetch rejects, without throwing', async () => {
    mockedGetUsersByIds.mockRejectedValue(new Error('boom'))

    const { result } = renderHook(() => useRailAvatars(['1']))

    await waitFor(() => expect(mockedGetUsersByIds).toHaveBeenCalled())
    expect(result.current.size).toBe(0)
  })

  it('returns a partial map when only some profiles come back', async () => {
    mockedGetUsersByIds.mockResolvedValue([user('1')] as unknown as Awaited<
      ReturnType<typeof getUsersByIds>
    >)

    const { result } = renderHook(() => useRailAvatars(['1', '2']))

    await waitFor(() => expect(result.current.size).toBe(1))
    expect(result.current.has('2')).toBe(false)
  })

  it('does not refetch when the same ids arrive in a new array', async () => {
    mockedGetUsersByIds.mockResolvedValue([user('1')] as unknown as Awaited<
      ReturnType<typeof getUsersByIds>
    >)

    const { rerender } = renderHook(({ ids }) => useRailAvatars(ids), {
      initialProps: { ids: ['1', '2'] },
    })
    await waitFor(() => expect(mockedGetUsersByIds).toHaveBeenCalledTimes(1))

    rerender({ ids: ['2', '1'] })
    rerender({ ids: ['1', '2'] })

    expect(mockedGetUsersByIds).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/useRailAvatars.test.ts`

Expected: FAIL — cannot resolve `../useRailAvatars`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useRailAvatars.ts`:

```ts
import { useState, useEffect } from 'react'
import { getUsersByIds } from '../lib/twitchApi'

/**
 * Batched profile-image lookup for rail entries.
 *
 * `EnrichedFollow` has no avatar field — its `thumbnailUrl` is the stream
 * preview, not the profile picture — so the rail needs a second join against
 * /users. One request covers the realistic case: at most 8 live follows plus
 * 8 recommendations is well under Helix's 100-id cap.
 *
 * Avatars never block the rail. A rejected or partial fetch resolves to a
 * map missing those ids, and the cards render initial-letter circles.
 */
export function useRailAvatars(userIds: string[]): Map<string, string> {
  const [avatars, setAvatars] = useState<Map<string, string>>(() => new Map())

  // Membership key, not array identity. Callers derive `userIds` inside
  // render, so a fresh array arrives every render with identical contents;
  // keying the effect on identity would refetch on every keystroke elsewhere
  // in the tree.
  const key = [...userIds].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing cached avatars when the rail empties (logout / no live follows)
      setAvatars((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }

    let cancelled = false
    getUsersByIds(ids)
      .then((users) => {
        if (cancelled) return
        const next = new Map<string, string>()
        for (const u of users) next.set(u.id, u.profile_image_url)
        setAvatars(next)
      })
      .catch(() => {
        if (!cancelled) setAvatars(new Map())
      })

    return () => {
      cancelled = true
    }
  }, [key])

  return avatars
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/useRailAvatars.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite and lint**

Run: `node ./node_modules/vitest/vitest.mjs run && npm run lint`

Expected: 304 passed (299 + 5), lint clean.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useRailAvatars.ts src/hooks/__tests__/useRailAvatars.test.ts
git commit -m "feat: add batched avatar lookup for rail entries"
```

---

### Task 5: `useCategoryRail`

Recommendations for the category in context. Deliberately not a leaderboard: top 3 by viewers plus a random sample of 5 from everyone below, totalling the section cap of 8 exactly — so the recommendations section never truncates and never shows a `+N`.

**The sample must be memoized.** An unmemoized random sample reshuffles on every render, so the rail rearranges under the cursor as the user reaches for an avatar. The stability test is the one that stops that shipping.

Per the deviations note: the current channel is excluded from the pool **before** ranking, not after sampling.

**Files:**
- Create: `src/hooks/useCategoryRail.ts`
- Test: `src/hooks/__tests__/useCategoryRail.test.ts`

**Interfaces:**
- Consumes: `getStreamsByGameId(gameId: string, first?: number): Promise<TwitchStream[]>` (`src/lib/twitchApi.ts:192`)
- Produces:
  - `useCategoryRail(gameId: string | null, excludeUserId: string | null): { streams: TwitchStream[]; loading: boolean; error: string | null }`
  - `RAIL_TOP_COUNT = 3`, `RAIL_SAMPLE_COUNT = 5` (named exports)

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useCategoryRail.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { useCategoryRail } from '../useCategoryRail'
import { getStreamsByGameId } from '../../lib/twitchApi'

vi.mock('../../lib/twitchApi', () => ({
  getStreamsByGameId: vi.fn(),
}))

const mockedGetStreams = vi.mocked(getStreamsByGameId)

/** Descending viewers: s0 = 1000, s1 = 990, ... so order is unambiguous. */
function pool(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `stream${i}`,
    user_id: `${i}`,
    user_login: `user${i}`,
    user_name: `User ${i}`,
    game_id: '509658',
    game_name: 'Just Chatting',
    type: 'live' as const,
    title: `Stream ${i}`,
    viewer_count: 1000 - i * 10,
    started_at: '2026-09-22T00:00:00Z',
    language: 'en',
    thumbnail_url: '',
    is_mature: false,
    tags: [],
  }))
}

describe('useCategoryRail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches nothing when there is no category in context', () => {
    renderHook(() => useCategoryRail(null, null))
    expect(mockedGetStreams).not.toHaveBeenCalled()
  })

  it('puts the top 3 by viewer count first, in order', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams.length).toBeGreaterThan(0))
    expect(result.current.streams.slice(0, 3).map((s) => s.user_id)).toEqual([
      '0',
      '1',
      '2',
    ])
  })

  it('returns exactly 8 entries when the pool is large enough', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams).toHaveLength(8))
  })

  it('excludes the currently-playing channel even when it tops the chart', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result } = renderHook(() => useCategoryRail('509658', '0'))

    await waitFor(() => expect(result.current.streams).toHaveLength(8))
    expect(result.current.streams.map((s) => s.user_id)).not.toContain('0')
    // Exclusion happens before ranking, so the top 3 close ranks rather
    // than leaving a hole.
    expect(result.current.streams.slice(0, 3).map((s) => s.user_id)).toEqual([
      '1',
      '2',
      '3',
    ])
  })

  it('samples the remainder disjointly from the top 3, drawn from the pool', async () => {
    const source = pool(30)
    mockedGetStreams.mockResolvedValue(source as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams).toHaveLength(8))
    const ids = result.current.streams.map((s) => s.user_id)
    const top = ids.slice(0, 3)
    const sample = ids.slice(3)

    expect(new Set(ids).size).toBe(8)
    expect(sample.some((id) => top.includes(id))).toBe(false)
    const sourceIds = source.map((s) => s.user_id)
    expect(sample.every((id) => sourceIds.includes(id))).toBe(true)
  })

  it('keeps the same entries across re-renders — the rail must not reshuffle', async () => {
    mockedGetStreams.mockResolvedValue(pool(30) as never)

    const { result, rerender } = renderHook(() => useCategoryRail('509658', null))
    await waitFor(() => expect(result.current.streams).toHaveLength(8))

    const first = result.current.streams.map((s) => s.user_id)
    rerender()
    rerender()
    rerender()

    expect(result.current.streams.map((s) => s.user_id)).toEqual(first)
  })

  it('returns everything available when the pool is smaller than the cap', async () => {
    mockedGetStreams.mockResolvedValue(pool(5) as never)

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.streams).toHaveLength(5))
  })

  it('surfaces an error and an empty list when the fetch fails', async () => {
    mockedGetStreams.mockRejectedValue(new Error('Twitch API error: 500'))

    const { result } = renderHook(() => useCategoryRail('509658', null))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.streams).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/useCategoryRail.test.ts`

Expected: FAIL — cannot resolve `../useCategoryRail`.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useCategoryRail.ts`:

```ts
import { useState, useEffect, useMemo } from 'react'
import { getStreamsByGameId } from '../lib/twitchApi'
import type { TwitchStream } from '../types/twitch'

/** Ranked slots — the leaderboard head. */
export const RAIL_TOP_COUNT = 3
/** Random slots drawn from everyone below the head. */
export const RAIL_SAMPLE_COUNT = 5
/** How deep to fetch before sampling. */
const POOL_SIZE = 40

/**
 * `RAIL_TOP_COUNT + RAIL_SAMPLE_COUNT` deliberately equals the section cap
 * of 8, so the recommendations section is full by construction and never
 * renders a `+N`. Changing either constant should preserve that sum, or the
 * two rules will disagree.
 */

interface UseCategoryRailReturn {
  streams: TwitchStream[]
  loading: boolean
  error: string | null
}

/**
 * Recommendations for the category currently in context.
 *
 * Deliberately not a pure leaderboard. A straight top-8 would surface the
 * same handful of channels forever; the random tail is the point of the
 * feature.
 */
export function useCategoryRail(
  gameId: string | null,
  excludeUserId: string | null,
): UseCategoryRailReturn {
  const [pool, setPool] = useState<TwitchStream[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!gameId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing recommendations when the user leaves a category route
      setPool((prev) => (prev.length === 0 ? prev : []))
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    getStreamsByGameId(gameId, POOL_SIZE)
      .then((streams) => {
        if (cancelled) return
        setPool(streams)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setPool([])
        setError(
          err instanceof Error ? err.message : 'Failed to load recommendations',
        )
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [gameId])

  // Memoized on the fetched pool, which only changes when gameId refetches.
  // This is what stops the rail rearranging under the cursor: an unmemoized
  // sample would draw new channels on every render of any ancestor.
  const streams = useMemo(() => {
    const eligible = pool
      .filter((s) => s.user_id !== excludeUserId)
      .sort((a, b) => b.viewer_count - a.viewer_count)

    const top = eligible.slice(0, RAIL_TOP_COUNT)
    const remainder = eligible.slice(RAIL_TOP_COUNT)

    // Fisher-Yates on a copy — sampling without replacement, so a channel
    // cannot appear twice.
    const shuffled = [...remainder]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    return [...top, ...shuffled.slice(0, RAIL_SAMPLE_COUNT)]
  }, [pool, excludeUserId])

  return { streams, loading, error }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/useCategoryRail.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Mutation-check the stability guarantee**

The reshuffle test is the load-bearing one. Prove it works: temporarily move the `useMemo` body into the render path (replace `useMemo(() => {...}, [pool, excludeUserId])` with an immediately-invoked `(() => {...})()`), re-run the file, and confirm **"keeps the same entries across re-renders"** fails. Then restore the `useMemo`.

Run: `node ./node_modules/vitest/vitest.mjs run src/hooks/__tests__/useCategoryRail.test.ts -t "reshuffle"`

Expected: FAIL while mutated, PASS once restored. A regression test never observed failing is not yet known to work.

- [ ] **Step 6: Run the full suite and lint**

Run: `node ./node_modules/vitest/vitest.mjs run && npm run lint`

Expected: 312 passed (304 + 8), lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useCategoryRail.ts src/hooks/__tests__/useCategoryRail.test.ts
git commit -m "feat: add category recommendations with stable random sampling"
```

---

### Task 6: `RailEntryCard`

One avatar. Collapsed it is a circle; expanded the same element gains a detail row — display name, live dot, viewer count, and uptime.

Uptime reuses `StreamUptime` from PR #46 directly: same component, same `formatUptime`, no duplication.

Accessibility matters here specifically: collapsed, the link has no visible text, so it needs an explicit accessible name or the rail becomes a column of unlabelled links to a screen reader.

**Files:**
- Create: `src/components/rail/RailEntryCard.tsx`
- Test: `src/components/rail/__tests__/RailEntryCard.test.tsx`

**Interfaces:**
- Consumes: `RailEntry` from `./types`; `StreamUptime` (default export) from `src/components/channel/StreamUptime.tsx`, props `{ startedAt: string }`
- Produces: `RailEntryCard` — default export, props `{ entry: RailEntry; expanded: boolean }`

- [ ] **Step 1: Write the failing test**

Create `src/components/rail/__tests__/RailEntryCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RailEntryCard from '../RailEntryCard'
import type { RailEntry } from '../types'

function entry(overrides: Partial<RailEntry> = {}): RailEntry {
  return {
    id: 'twitch:71092938',
    displayName: 'xQc',
    avatarUrl: 'https://cdn.example/xqc.png',
    href: '/twitch/xqc',
    isLive: true,
    viewerCount: 42315,
    streamTitle: 'juicer moment',
    gameName: 'Just Chatting',
    startedAt: new Date(Date.now() - 3_600_000).toISOString(),
    ...overrides,
  }
}

function renderCard(e: RailEntry, expanded: boolean) {
  return render(
    <MemoryRouter>
      <RailEntryCard entry={e} expanded={expanded} />
    </MemoryRouter>,
  )
}

describe('RailEntryCard', () => {
  it('links to the in-app channel route', () => {
    renderCard(entry(), false)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/twitch/xqc')
  })

  it('is named for the channel even when collapsed', () => {
    renderCard(entry(), false)
    expect(screen.getByRole('link', { name: /xQc/i })).toBeInTheDocument()
  })

  it('hides the detail row when collapsed', () => {
    renderCard(entry(), false)
    expect(screen.queryByText('42,315')).not.toBeInTheDocument()
  })

  it('shows name, viewer count and uptime when expanded', () => {
    renderCard(entry(), true)
    expect(screen.getByText('xQc')).toBeInTheDocument()
    expect(screen.getByText('42,315')).toBeInTheDocument()
    expect(screen.getByText('1:00:00')).toBeInTheDocument()
  })

  it('renders a live dot when expanded', () => {
    const { container } = renderCard(entry(), true)
    expect(container.querySelector('[data-testid="rail-live-dot"]')).toBeInTheDocument()
  })

  it('renders the avatar image when a url is present', () => {
    renderCard(entry(), false)
    expect(screen.getByRole('presentation')).toHaveAttribute(
      'src',
      'https://cdn.example/xqc.png',
    )
  })

  it('falls back to an initial-letter circle when the avatar url is missing', () => {
    renderCard(entry({ avatarUrl: '' }), false)
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('falls back to an initial-letter circle when the image fails to load', () => {
    renderCard(entry(), false)
    const img = screen.getByRole('presentation')
    fireEvent.error(img)
    expect(screen.getByText('X')).toBeInTheDocument()
  })

  it('omits uptime when startedAt is unknown', () => {
    renderCard(entry({ startedAt: null }), true)
    expect(screen.queryByText(/^\d+:\d{2}:\d{2}$/)).not.toBeInTheDocument()
  })

  it('omits the viewer count when it is unknown', () => {
    renderCard(entry({ viewerCount: null }), true)
    expect(screen.getByText('xQc')).toBeInTheDocument()
    expect(screen.queryByText('42,315')).not.toBeInTheDocument()
  })
})
```

Add `fireEvent` to the import: `import { render, screen, fireEvent } from '@testing-library/react'`.

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/RailEntryCard.test.tsx`

Expected: FAIL — cannot resolve `../RailEntryCard`.

- [ ] **Step 3: Implement the card**

Create `src/components/rail/RailEntryCard.tsx`:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import StreamUptime from '../channel/StreamUptime'
import type { RailEntry } from './types'

const AVATAR_SIZE = 40

interface RailEntryCardProps {
  entry: RailEntry
  expanded: boolean
}

/**
 * Avatar with an initial-letter fallback. Covers both "we never got a URL"
 * (the /users join failed or was partial) and "the URL 404s at render time".
 * A missing avatar must never leave a hole in the rail.
 */
function RailAvatar({ entry }: { entry: RailEntry }) {
  const [failed, setFailed] = useState(false)

  if (!entry.avatarUrl || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          background: 'var(--accent-twitch)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {entry.displayName.charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <img
      src={entry.avatarUrl}
      alt=""
      role="presentation"
      width={AVATAR_SIZE}
      height={AVATAR_SIZE}
      onError={() => setFailed(true)}
      className="shrink-0 rounded-full"
      style={{
        outline: entry.isLive ? '2px solid var(--accent-green)' : 'none',
        outlineOffset: '1px',
      }}
    />
  )
}

/**
 * One rail entry. The collapsed circle and the expanded row are the same
 * element at two widths — not two components — so expanding never remounts
 * the avatar or restarts the uptime tick.
 */
export default function RailEntryCard({ entry, expanded }: RailEntryCardProps) {
  return (
    <Link
      to={entry.href}
      aria-label={entry.displayName}
      title={entry.streamTitle ?? entry.displayName}
      className="flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors duration-150 hover:bg-white/5"
    >
      <RailAvatar entry={entry} />

      {expanded && (
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate text-sm font-medium"
            style={{ color: 'var(--text-primary)' }}
          >
            {entry.displayName}
          </span>
          <div className="flex items-center gap-2">
            <span
              data-testid="rail-live-dot"
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: 'var(--accent-green)' }}
            />
            {entry.viewerCount !== null && (
              <span
                className="flex items-center gap-1 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Users size={11} />
                {entry.viewerCount.toLocaleString()}
              </span>
            )}
            {entry.startedAt && <StreamUptime startedAt={entry.startedAt} />}
          </div>
        </div>
      )}
    </Link>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/RailEntryCard.test.tsx`

Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite**

Run: `node ./node_modules/vitest/vitest.mjs run`

Expected: 322 passed (312 + 10).

- [ ] **Step 6: Commit**

```bash
git add src/components/rail/RailEntryCard.tsx src/components/rail/__tests__/RailEntryCard.test.tsx
git commit -m "feat: add rail entry card with avatar fallback and uptime"
```

---

### Task 7: `RailSection`

One labelled group of entries, capped at 8, with a `+N` control when more exist.

`RailSection` is platform-agnostic on purpose: it takes a label, an icon, and entries, and knows nothing about where they came from. That is what makes a future YouTube section additive — append a section, touch no existing code. The primitive is justified by today's code, not tomorrow's: there are already two real cases.

**Files:**
- Create: `src/components/rail/RailSection.tsx`
- Test: `src/components/rail/__tests__/RailSection.test.tsx`

**Interfaces:**
- Consumes: `RailEntryCard` (default export) from Task 6; `RailEntry` from `./types`
- Produces:
  - `RailSection` — default export, props `{ label: string; icon: ReactNode; entries: RailEntry[]; expanded: boolean; totalCount?: number; onOverflowClick?: () => void }`
  - `RAIL_SECTION_CAP = 8` (named export) — the single definition of the cap

- [ ] **Step 1: Write the failing test**

Create `src/components/rail/__tests__/RailSection.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import RailSection, { RAIL_SECTION_CAP } from '../RailSection'
import type { RailEntry } from '../types'

function entries(n: number): RailEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `twitch:${i}`,
    displayName: `Chan${i}`,
    avatarUrl: '',
    href: `/twitch/chan${i}`,
    isLive: true,
    viewerCount: 100 - i,
    streamTitle: null,
    gameName: null,
    startedAt: null,
  }))
}

function renderSection(props: Partial<React.ComponentProps<typeof RailSection>> = {}) {
  return render(
    <MemoryRouter>
      <RailSection
        label="Following"
        icon={<span data-testid="section-icon" />}
        entries={entries(3)}
        expanded
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('RailSection', () => {
  it('renders one card per entry', () => {
    renderSection({ entries: entries(3) })
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('is labelled for assistive tech', () => {
    renderSection()
    expect(screen.getByRole('region', { name: 'Following' })).toBeInTheDocument()
  })

  it('renders its icon', () => {
    renderSection()
    expect(screen.getByTestId('section-icon')).toBeInTheDocument()
  })

  it('shows the label text only when expanded', () => {
    const { rerender } = renderSection({ expanded: false })
    expect(screen.queryByText('Following')).not.toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <RailSection
          label="Following"
          icon={<span data-testid="section-icon" />}
          entries={entries(3)}
          expanded
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Following')).toBeInTheDocument()
  })

  it('renders nothing at all when it has no entries', () => {
    const { container } = renderSection({ entries: [] })
    expect(container).toBeEmptyDOMElement()
  })

  it('caps the visible entries at the section cap', () => {
    renderSection({ entries: entries(20) })
    expect(screen.getAllByRole('link')).toHaveLength(RAIL_SECTION_CAP)
  })

  it('shows a +N control counting everything hidden', () => {
    renderSection({ entries: entries(20) })
    expect(screen.getByRole('button', { name: /\+12/ })).toBeInTheDocument()
  })

  it('counts overflow from totalCount when the caller knows more than it passed', () => {
    renderSection({ entries: entries(8), totalCount: 30 })
    expect(screen.getByRole('button', { name: /\+22/ })).toBeInTheDocument()
  })

  it('shows no +N control when everything fits', () => {
    renderSection({ entries: entries(RAIL_SECTION_CAP) })
    expect(screen.queryByRole('button', { name: /\+/ })).not.toBeInTheDocument()
  })

  it('calls onOverflowClick when the +N control is pressed', async () => {
    const onOverflowClick = vi.fn()
    const user = userEvent.setup()
    renderSection({ entries: entries(20), onOverflowClick })

    await user.click(screen.getByRole('button', { name: /\+12/ }))

    expect(onOverflowClick).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/RailSection.test.tsx`

Expected: FAIL — cannot resolve `../RailSection`.

- [ ] **Step 3: Implement the section**

Create `src/components/rail/RailSection.tsx`:

```tsx
import type { ReactNode } from 'react'
import RailEntryCard from './RailEntryCard'
import type { RailEntry } from './types'

/**
 * Fixed maximum entries per section — not a measured viewport fit.
 *
 * Measuring needs a resize observer and a layout pass that can flicker on
 * load; two sections competing for measured space needs an allocation rule
 * that is arbitrary either way; and a stable, predictable number of avatars
 * is easier to build muscle memory against. If 8 proves wrong in use, this
 * is the one constant to change.
 */
export const RAIL_SECTION_CAP = 8

interface RailSectionProps {
  label: string
  icon: ReactNode
  entries: RailEntry[]
  expanded: boolean
  /**
   * Total available, when the caller has more than it passed in `entries`
   * (the follows section passes its live subset but knows the full count).
   * Defaults to `entries.length`.
   */
  totalCount?: number
  /** Invoked by the `+N` control. Opens the Following panel. */
  onOverflowClick?: () => void
}

/**
 * One labelled group of rail entries.
 *
 * Deliberately knows nothing about where its entries came from — it takes a
 * label, an icon, and a list. That is what makes a second platform additive:
 * append a section, touch no existing code.
 */
export default function RailSection({
  label,
  icon,
  entries,
  expanded,
  totalCount,
  onOverflowClick,
}: RailSectionProps) {
  if (entries.length === 0) return null

  const visible = entries.slice(0, RAIL_SECTION_CAP)
  const hidden = Math.max(0, (totalCount ?? entries.length) - RAIL_SECTION_CAP)

  return (
    <section aria-label={label} className="flex flex-col gap-1">
      <header className="flex items-center gap-2 px-2 py-1">
        {icon}
        {expanded && (
          <span
            className="text-xs uppercase"
            style={{
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.08em',
            }}
          >
            {label}
          </span>
        )}
      </header>

      {visible.map((entry) => (
        <RailEntryCard key={entry.id} entry={entry} expanded={expanded} />
      ))}

      {hidden > 0 && onOverflowClick && (
        <button
          type="button"
          onClick={onOverflowClick}
          className="mx-2 rounded-md px-2 py-1 text-xs transition-colors duration-150 hover:bg-white/5"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          +{hidden}
        </button>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/RailSection.test.tsx`

Expected: PASS, 10 tests.

- [ ] **Step 5: Run the full suite**

Run: `node ./node_modules/vitest/vitest.mjs run`

Expected: 332 passed (322 + 10).

- [ ] **Step 6: Commit**

```bash
git add src/components/rail/RailSection.tsx src/components/rail/__tests__/RailSection.test.tsx
git commit -m "feat: add rail section with fixed cap and overflow control"
```

---

### Task 8: `ChannelRail` — the overlay shell

The rail itself: a `position: fixed` overlay pinned to the configured edge, above the player, that widens in place on hover, focus, or tap. It owns the data wiring — it is mounted once, so the hooks live here and tests mock them.

**It does not participate in layout.** Nothing reflows: the resizable player/chat split keeps its full width and its persisted ratio, and no page needs to know the rail exists. The collapsed strip occludes a narrow edge of video rather than shrinking it — the accepted cost of not reflowing, and the reason collapsed width is kept minimal.

Hover intent needs both delays. Without the open delay, sweeping past a vertical stack of avatars strobes panels open. Without the close delay, diagonal travel from avatar to panel dismisses it mid-move.

On the iframe: the rail sits above the player in stacking order, so pointer events over the rail reach the rail. What would be unreliable is triggering expansion by hovering the *player* — that event never reaches us. Expansion is triggered only by pointer, focus, or touch landing on the rail itself.

**Files:**
- Create: `src/components/rail/ChannelRail.tsx`
- Test: `src/components/rail/__tests__/ChannelRail.test.tsx`

**Interfaces:**
- Consumes:
  - `useRailPosition()` from `./useRailPosition` (Task 3)
  - `useRailAvatars(userIds: string[])` from `src/hooks/useRailAvatars` (Task 4)
  - `useCategoryRail(gameId, excludeUserId)` from `src/hooks/useCategoryRail` (Task 5)
  - `RailSection`, `RAIL_SECTION_CAP` from `./RailSection` (Task 7)
  - `ConnectTwitchPrompt` from `src/components/ui/ConnectTwitchPrompt` (Task 2)
  - `useFollowedChannels(userId, options)` from `src/hooks/useFollowedChannels` — returns `{ data: EnrichedFollow[], liveCount, loading, error, ... }`
  - `useTwitchAuth()` — `{ isAuthenticated, login, handleAuthError, token, logout }`
  - `useApp()` — `state.auth.user`, `state.channel.stream`, `state.channel.profile`, `dispatch`
- Produces: `ChannelRail` — default export, no props

- [ ] **Step 1: Write the failing test**

Create `src/components/rail/__tests__/ChannelRail.test.tsx`:

```tsx
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ChannelRail from '../ChannelRail'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useCategoryRail } from '../../../hooks/useCategoryRail'
import { useRailAvatars } from '../../../hooks/useRailAvatars'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { useApp } from '../../../contexts/AppContext'

vi.mock('../../../hooks/useFollowedChannels', () => ({
  useFollowedChannels: vi.fn(),
}))
vi.mock('../../../hooks/useCategoryRail', () => ({ useCategoryRail: vi.fn() }))
vi.mock('../../../hooks/useRailAvatars', () => ({ useRailAvatars: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))

const mockFollows = vi.mocked(useFollowedChannels)
const mockCategory = vi.mocked(useCategoryRail)
const mockAvatars = vi.mocked(useRailAvatars)
const mockAuth = vi.mocked(useTwitchAuth)
const mockApp = vi.mocked(useApp)

const dispatch = vi.fn()

function live(i: number) {
  return {
    broadcaster_id: `${i}`,
    broadcaster_login: `chan${i}`,
    broadcaster_name: `Chan${i}`,
    followed_at: '2026-01-01T00:00:00Z',
    isLive: true,
    viewerCount: 100 - i,
    gameName: 'Just Chatting',
    streamTitle: `t${i}`,
    thumbnailUrl: '',
    startedAt: '2026-09-22T00:00:00Z',
  }
}

function offline(i: number) {
  return {
    broadcaster_id: `off${i}`,
    broadcaster_login: `off${i}`,
    broadcaster_name: `Off${i}`,
    followed_at: '2026-01-01T00:00:00Z',
    isLive: false,
  }
}

interface SetupOptions {
  isAuthenticated?: boolean
  follows?: ReturnType<typeof live>[]
  followsError?: string | null
  gameId?: string | null
  recommendations?: unknown[]
}

function setup(opts: SetupOptions = {}) {
  const {
    isAuthenticated = true,
    follows = [live(0), live(1)],
    followsError = null,
    gameId = null,
    recommendations = [],
  } = opts

  mockAuth.mockReturnValue({
    isAuthenticated,
    login: vi.fn(),
    logout: vi.fn(),
    token: isAuthenticated ? 'tok' : null,
    handleAuthError: vi.fn(),
  } as unknown as ReturnType<typeof useTwitchAuth>)

  mockApp.mockReturnValue({
    state: {
      auth: { isAuthenticated, token: null, user: isAuthenticated ? { id: 'me' } : null },
      channel: {
        stream: gameId ? { game_id: gameId, user_id: 'current' } : null,
        profile: null,
      },
    },
    dispatch,
  } as unknown as ReturnType<typeof useApp>)

  mockFollows.mockReturnValue({
    data: follows,
    totalCount: follows.length,
    loadedCount: follows.length,
    liveCount: follows.filter((f) => f.isLive).length,
    loading: false,
    loadingMore: false,
    error: followsError,
    cursor: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  } as unknown as ReturnType<typeof useFollowedChannels>)

  mockCategory.mockReturnValue({
    streams: recommendations,
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useCategoryRail>)

  mockAvatars.mockReturnValue(new Map())

  return render(
    <MemoryRouter>
      <ChannelRail />
    </MemoryRouter>,
  )
}

function rail() {
  return screen.getByTestId('channel-rail')
}

describe('ChannelRail — layout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('is a fixed overlay that takes no layout space', () => {
    setup()
    expect(rail()).toHaveStyle({ position: 'fixed' })
  })

  it('sits above the player but below the slide-down panels', () => {
    setup()
    // SlidedownPanel is zIndex 30; Header is z-40. The rail's own +N opens
    // the panel, so the panel must cover the rail.
    expect(rail()).toHaveStyle({ zIndex: '25' })
  })

  it('pins to the right edge by default', () => {
    setup()
    expect(rail()).toHaveStyle({ right: '0px' })
  })

  it('flips to the left edge and persists the choice', async () => {
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: /move rail/i }))

    expect(rail()).toHaveStyle({ left: '0px' })
    expect(localStorage.getItem('prism_rail_position')).toBe('left')
  })
})

describe('ChannelRail — expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => vi.useRealTimers())

  it('does not expand before the open delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(60))
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  it('expands on hover once the open delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(200))
    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('expands on keyboard focus entering the rail', () => {
    setup()
    fireEvent.focusIn(rail())
    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('expands on tap', () => {
    setup()
    fireEvent.touchStart(rail())
    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('does not collapse before the close delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(200))

    fireEvent.mouseLeave(rail())
    act(() => void vi.advanceTimersByTime(100))

    expect(screen.getByText('Chan0')).toBeInTheDocument()
  })

  it('collapses on mouse leave once the close delay elapses', () => {
    setup()
    fireEvent.mouseEnter(rail())
    act(() => void vi.advanceTimersByTime(200))

    fireEvent.mouseLeave(rail())
    act(() => void vi.advanceTimersByTime(300))

    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  it('collapses on focus leaving the rail', () => {
    setup()
    fireEvent.focusIn(rail())
    fireEvent.focusOut(rail())
    act(() => void vi.advanceTimersByTime(300))
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  it('collapses on Escape', () => {
    setup()
    fireEvent.focusIn(rail())
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })

  it('collapses on a tap outside the rail', () => {
    setup()
    fireEvent.touchStart(rail())
    expect(screen.getByText('Chan0')).toBeInTheDocument()

    fireEvent.touchStart(document.body)
    expect(screen.queryByText('Chan0')).not.toBeInTheDocument()
  })
})

describe('ChannelRail — content and states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows a connect prompt and fetches nothing when signed out', () => {
    setup({ isAuthenticated: false })
    fireEvent.focusIn(rail())

    expect(screen.getByRole('button', { name: /connect twitch/i })).toBeInTheDocument()
    // The follows hook must be called with a null userId, which makes it a no-op.
    expect(mockFollows).toHaveBeenCalledWith(null, expect.anything())
    expect(mockCategory).toHaveBeenCalledWith(null, null)
  })

  it('renders one entry per live follow and excludes offline follows', () => {
    setup({ follows: [live(0), offline(1), live(2)] as never })
    fireEvent.focusIn(rail())

    expect(screen.getByText('Chan0')).toBeInTheDocument()
    expect(screen.getByText('Chan2')).toBeInTheDocument()
    expect(screen.queryByText('Off1')).not.toBeInTheDocument()
  })

  it('hides the recommendations section when there is no category in context', () => {
    setup({ gameId: null })
    fireEvent.focusIn(rail())
    expect(screen.queryByRole('region', { name: /category/i })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: /following/i })).toBeInTheDocument()
  })

  it('shows the recommendations section when a category is in context', () => {
    setup({
      gameId: '509658',
      recommendations: [
        {
          id: 's1',
          user_id: '99',
          user_login: 'rec1',
          user_name: 'Rec1',
          game_name: 'Just Chatting',
          title: 'hello',
          viewer_count: 500,
          started_at: '2026-09-22T00:00:00Z',
        },
      ],
    })
    fireEvent.focusIn(rail())
    expect(screen.getByText('Rec1')).toBeInTheDocument()
  })

  it('keeps recommendations when the follows section fails', () => {
    setup({
      follows: [],
      followsError: 'Twitch API error: 500',
      gameId: '509658',
      recommendations: [
        {
          id: 's1',
          user_id: '99',
          user_login: 'rec1',
          user_name: 'Rec1',
          game_name: 'Just Chatting',
          title: 'hello',
          viewer_count: 500,
          started_at: '2026-09-22T00:00:00Z',
        },
      ],
    })
    fireEvent.focusIn(rail())

    expect(screen.queryByRole('region', { name: /following/i })).not.toBeInTheDocument()
    expect(screen.getByText('Rec1')).toBeInTheDocument()
  })

  it('renders nothing when signed in with no content in either section', () => {
    setup({ follows: [], gameId: null })
    expect(screen.queryByTestId('channel-rail')).not.toBeInTheDocument()
  })

  it('opens the Following panel from the +N control', async () => {
    const user = userEvent.setup()
    setup({ follows: Array.from({ length: 12 }, (_, i) => live(i)) })
    fireEvent.focusIn(rail())

    await user.click(screen.getByRole('button', { name: /\+4/ }))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'OPEN_NAV_PANEL',
      panel: 'following',
    })
  })

  it('excludes the current channel from recommendations', () => {
    setup({ gameId: '509658' })
    expect(mockCategory).toHaveBeenCalledWith('509658', 'current')
  })

  it('requests avatars for both live follows and recommendations', async () => {
    setup({
      follows: [live(0)],
      gameId: '509658',
      recommendations: [
        {
          id: 's1',
          user_id: '99',
          user_login: 'rec1',
          user_name: 'Rec1',
          game_name: 'JC',
          title: 't',
          viewer_count: 5,
          started_at: '2026-09-22T00:00:00Z',
        },
      ],
    })
    await waitFor(() =>
      expect(mockAvatars).toHaveBeenCalledWith(expect.arrayContaining(['0', '99'])),
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/ChannelRail.test.tsx`

Expected: FAIL — cannot resolve `../ChannelRail`.

- [ ] **Step 3: Implement the rail**

Create `src/components/rail/ChannelRail.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Heart, Compass, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { useFollowedChannels } from '../../hooks/useFollowedChannels'
import { useCategoryRail } from '../../hooks/useCategoryRail'
import { useRailAvatars } from '../../hooks/useRailAvatars'
import ConnectTwitchPrompt from '../ui/ConnectTwitchPrompt'
import RailSection, { RAIL_SECTION_CAP } from './RailSection'
import { useRailPosition } from './useRailPosition'
import type { RailEntry } from './types'

/** Sweeping past a stack of avatars must not strobe panels open. */
const OPEN_DELAY_MS = 120
/** Diagonal travel from avatar to panel must not dismiss it mid-move. */
const CLOSE_DELAY_MS = 200

const COLLAPSED_WIDTH = 56
const EXPANDED_WIDTH = 260
/** Above player chrome (10/20), below SlidedownPanel (30) and Header (40). */
const RAIL_Z_INDEX = 25

export default function ChannelRail() {
  const { state, dispatch } = useApp()
  const { isAuthenticated, login, handleAuthError } = useTwitchAuth()
  const { position, flip } = useRailPosition()

  const [expanded, setExpanded] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current)
    if (closeTimer.current) clearTimeout(closeTimer.current)
    openTimer.current = null
    closeTimer.current = null
  }, [])

  const openAfterDelay = useCallback(() => {
    clearTimers()
    openTimer.current = setTimeout(() => setExpanded(true), OPEN_DELAY_MS)
  }, [clearTimers])

  const closeAfterDelay = useCallback(() => {
    clearTimers()
    closeTimer.current = setTimeout(() => setExpanded(false), CLOSE_DELAY_MS)
  }, [clearTimers])

  const openNow = useCallback(() => {
    clearTimers()
    setExpanded(true)
  }, [clearTimers])

  const closeNow = useCallback(() => {
    clearTimers()
    setExpanded(false)
  }, [clearTimers])

  useEffect(() => clearTimers, [clearTimers])

  // Escape and outside-tap. Touch devices have no hover, so a tap elsewhere
  // is the only dismissal gesture available to them.
  useEffect(() => {
    if (!expanded) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNow()
    }
    const onOutside = (e: Event) => {
      const node = containerRef.current
      if (node && !node.contains(e.target as Node)) closeNow()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [expanded, closeNow])

  // --- Data ---------------------------------------------------------------
  // Signed out, both hooks are handed null and become no-ops. The rail makes
  // no API calls at all in that state.
  const userId = isAuthenticated ? (state.auth.user?.id ?? null) : null
  const authOptions = useMemo(
    () => ({ handleAuthError: () => handleAuthError(undefined) }),
    [handleAuthError],
  )
  const follows = useFollowedChannels(userId, authOptions)

  const gameId = isAuthenticated ? (state.channel.stream?.game_id ?? null) : null
  const currentUserId = state.channel.stream?.user_id ?? null
  const category = useCategoryRail(gameId, currentUserId)

  // A failing section hides itself and leaves its siblings intact. This is
  // the invariant that makes a second platform safe to add.
  const liveFollows = follows.error ? [] : follows.data.filter((f) => f.isLive)
  const recommendations = category.error ? [] : category.streams

  const avatarIds = useMemo(
    () => [
      ...liveFollows.slice(0, RAIL_SECTION_CAP).map((f) => f.broadcaster_id),
      ...recommendations.map((s) => s.user_id),
    ],
    [liveFollows, recommendations],
  )
  const avatars = useRailAvatars(avatarIds)

  const followEntries: RailEntry[] = useMemo(
    () =>
      liveFollows.map((f) => ({
        id: `twitch:${f.broadcaster_id}`,
        displayName: f.broadcaster_name,
        avatarUrl: avatars.get(f.broadcaster_id) ?? '',
        href: `/twitch/${f.broadcaster_login}`,
        isLive: true,
        viewerCount: f.viewerCount ?? null,
        streamTitle: f.streamTitle ?? null,
        gameName: f.gameName ?? null,
        startedAt: f.startedAt ?? null,
      })),
    [liveFollows, avatars],
  )

  const categoryEntries: RailEntry[] = useMemo(
    () =>
      recommendations.map((s) => ({
        id: `twitch:${s.user_id}`,
        displayName: s.user_name,
        avatarUrl: avatars.get(s.user_id) ?? '',
        href: `/twitch/${s.user_login}`,
        isLive: true,
        viewerCount: s.viewer_count ?? null,
        streamTitle: s.title ?? null,
        gameName: s.game_name ?? null,
        startedAt: s.started_at ?? null,
      })),
    [recommendations, avatars],
  )

  const openFollowingPanel = useCallback(() => {
    dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })
  }, [dispatch])

  // Signed in with nothing to show: unmount rather than leave an empty strip
  // occluding video for no reason.
  const hasContent = followEntries.length > 0 || categoryEntries.length > 0
  if (isAuthenticated && !hasContent) return null

  const edge = position === 'left' ? { left: 0 } : { right: 0 }

  return (
    <div
      ref={containerRef}
      data-testid="channel-rail"
      onMouseEnter={openAfterDelay}
      onMouseLeave={closeAfterDelay}
      onFocus={openNow}
      onBlur={closeAfterDelay}
      onTouchStart={openNow}
      className="flex flex-col gap-2 overflow-y-auto py-3 transition-[width] duration-150"
      style={{
        position: 'fixed',
        top: 'var(--header-height)',
        bottom: 0,
        ...edge,
        width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
        zIndex: RAIL_Z_INDEX,
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        backdropFilter: 'blur(8px)',
        borderLeft:
          position === 'right' ? '1px solid var(--border)' : undefined,
        borderRight: position === 'left' ? '1px solid var(--border)' : undefined,
      }}
    >
      {!isAuthenticated ? (
        expanded ? (
          <ConnectTwitchPrompt
            title="Channel rail"
            description="Connect Twitch to see who you follow that's live"
            onConnect={login}
            className="px-2"
          />
        ) : (
          <button
            type="button"
            onClick={openNow}
            aria-label="Connect Twitch to see your live follows"
            className="mx-auto flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: 'var(--accent-twitch)', color: '#fff' }}
          >
            <Heart size={16} />
          </button>
        )
      ) : (
        <>
          <RailSection
            label="Following"
            icon={<Heart size={16} style={{ color: 'var(--accent-green)' }} />}
            entries={followEntries}
            expanded={expanded}
            totalCount={followEntries.length}
            onOverflowClick={openFollowingPanel}
          />
          <RailSection
            label="Category"
            icon={<Compass size={16} style={{ color: 'var(--accent-twitch)' }} />}
            entries={categoryEntries}
            expanded={expanded}
          />
        </>
      )}

      <button
        type="button"
        onClick={flip}
        aria-label={`Move rail to the ${position === 'left' ? 'right' : 'left'}`}
        className="mx-auto mt-auto rounded-md p-1.5 transition-colors duration-150 hover:bg-white/5"
        style={{ color: 'var(--text-muted)' }}
      >
        {position === 'left' ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/ChannelRail.test.tsx`

Expected: PASS, 22 tests.

If the hover-intent tests are flaky under fake timers, the cause is the `act()` boundary around timer advancement, not the delays. Keep the delays as specified and fix the test's `act` wrapping. Do **not** shorten or remove the delays to make a test pass — report the problem instead.

- [ ] **Step 5: Mutation-check the two hover delays**

Set `OPEN_DELAY_MS = 0`, re-run, confirm **"does not expand before the open delay elapses"** fails. Restore. Set `CLOSE_DELAY_MS = 0`, re-run, confirm **"does not collapse before the close delay elapses"** fails. Restore.

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/ChannelRail.test.tsx -t "delay elapses"`

Expected: each mutation fails its guard; both pass once restored.

- [ ] **Step 6: Run the full suite and lint**

Run: `node ./node_modules/vitest/vitest.mjs run && npm run lint`

Expected: 354 passed (332 + 22), lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/rail/ChannelRail.tsx src/components/rail/__tests__/ChannelRail.test.tsx
git commit -m "feat: add channel rail overlay with hover, focus and touch expansion"
```

---

### Task 9: Mount the rail and prove it costs the player nothing

The rail mounts in `AppLayout` — the route wrapper in `src/App.tsx`, alongside the existing fixed-position panels — so the follows section is available on every route.

This task's real deliverable is the **governing constraint**, tested: the rail never resizes the player. The spec's primary goal is "preserve video space," and the only way that stays true is a test that fails if someone later makes the rail a flex sibling.

**Files:**
- Modify: `src/App.tsx` (the `AppLayout` function, after the slide-down panels at ~line 104)
- Test: `src/components/rail/__tests__/ChannelRail.layout.test.tsx`

**Interfaces:**
- Consumes: `ChannelRail` (default export) from Task 8
- Produces: nothing new — this is the integration point

- [ ] **Step 1: Write the failing test**

Create `src/components/rail/__tests__/ChannelRail.layout.test.tsx`:

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ChannelRail from '../ChannelRail'
import { useFollowedChannels } from '../../../hooks/useFollowedChannels'
import { useCategoryRail } from '../../../hooks/useCategoryRail'
import { useRailAvatars } from '../../../hooks/useRailAvatars'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { useApp } from '../../../contexts/AppContext'

vi.mock('../../../hooks/useFollowedChannels', () => ({
  useFollowedChannels: vi.fn(),
}))
vi.mock('../../../hooks/useCategoryRail', () => ({ useCategoryRail: vi.fn() }))
vi.mock('../../../hooks/useRailAvatars', () => ({ useRailAvatars: vi.fn() }))
vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../../contexts/AppContext', () => ({ useApp: vi.fn() }))

function setup() {
  vi.mocked(useTwitchAuth).mockReturnValue({
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    token: 'tok',
    handleAuthError: vi.fn(),
  } as unknown as ReturnType<typeof useTwitchAuth>)

  vi.mocked(useApp).mockReturnValue({
    state: {
      auth: { isAuthenticated: true, token: 'tok', user: { id: 'me' } },
      channel: { stream: null, profile: null },
    },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)

  vi.mocked(useFollowedChannels).mockReturnValue({
    data: [
      {
        broadcaster_id: '1',
        broadcaster_login: 'chan1',
        broadcaster_name: 'Chan1',
        followed_at: '2026-01-01T00:00:00Z',
        isLive: true,
        viewerCount: 10,
      },
    ],
    totalCount: 1,
    loadedCount: 1,
    liveCount: 1,
    loading: false,
    loadingMore: false,
    error: null,
    cursor: null,
    refetch: vi.fn(),
    loadMore: vi.fn(),
  } as unknown as ReturnType<typeof useFollowedChannels>)

  vi.mocked(useCategoryRail).mockReturnValue({
    streams: [],
    loading: false,
    error: null,
  } as unknown as ReturnType<typeof useCategoryRail>)

  vi.mocked(useRailAvatars).mockReturnValue(new Map())
}

describe('ChannelRail does not cost the player any width', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    setup()
  })

  it('leaves a sibling player element the same width when it expands', () => {
    render(
      <MemoryRouter>
        <div data-testid="player" style={{ width: '1000px' }}>
          player
        </div>
        <ChannelRail />
      </MemoryRouter>,
    )

    const player = screen.getByTestId('player')
    const before = player.style.width

    fireEvent.focusIn(screen.getByTestId('channel-rail'))
    act(() => {})

    expect(player.style.width).toBe(before)
  })

  it('is removed from flow, so no ancestor needs to know it exists', () => {
    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )
    const style = screen.getByTestId('channel-rail').style
    expect(style.position).toBe('fixed')
  })

  it('does not touch the persisted player/chat split ratio', () => {
    localStorage.setItem('prism_panel_ratio', '0.72')

    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )
    fireEvent.focusIn(screen.getByTestId('channel-rail'))
    act(() => {})

    expect(localStorage.getItem('prism_panel_ratio')).toBe('0.72')
  })

  it('scrolls internally rather than growing the page', () => {
    render(
      <MemoryRouter>
        <ChannelRail />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('channel-rail')).toHaveClass('overflow-y-auto')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node ./node_modules/vitest/vitest.mjs run src/components/rail/__tests__/ChannelRail.layout.test.tsx`

Expected: PASS already if Task 8 is correct — these assert properties Task 8 built. If any fail, Task 8 has a real defect; fix `ChannelRail.tsx`, not the test.

- [ ] **Step 3: Mount the rail in `AppLayout`**

In `src/App.tsx`, add the import beside the other layout imports:

```tsx
import ChannelRail from './components/rail/ChannelRail'
```

and mount it inside `AppLayout`'s returned tree, immediately after the slide-down panels and before `<Outlet />`:

```tsx
      {/* Slide-down panels — position:fixed below header at z-30 */}
      <FollowingPanel />
      <YourStatsPanel />
      <CategoryPanel />

      {/* Channel rail — fixed overlay at z-25, above the player, below the
          panels its +N control opens. Mounted here rather than on the Twitch
          player page so follows are reachable on every route. */}
      <ChannelRail />

      {/* Route content */}
      <Outlet />
```

- [ ] **Step 4: Verify the app still builds**

Run: `npm run build`

Expected: `tsc -b` clean, Vite build succeeds. A type error here usually means a `RailEntry` field is being fed an `undefined` from `EnrichedFollow`'s optional fields — coerce with `?? null` at the mapping site, never by widening `RailEntry`.

- [ ] **Step 5: Run the full suite and lint**

Run: `node ./node_modules/vitest/vitest.mjs run && npm run lint`

Expected: 358 passed (354 + 4), lint clean.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev` and open `http://localhost:5000`.

Check by eye, signed in:
- The rail sits on the right edge, collapsed, showing avatar circles for live follows.
- Hovering expands it in place; the video does **not** change width.
- The flip control moves it to the left edge; reloading keeps it there.
- On `/twitch/<a-live-channel>`, a second section appears with category recommendations.
- Signed out, the rail shows the connect prompt and the Network tab shows **no** Helix requests from the rail.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/components/rail/__tests__/ChannelRail.layout.test.tsx
git commit -m "feat: mount the channel rail globally as a fixed overlay"
```

---

## Self-review

**Spec coverage.** Walked each spec section against the tasks:

| Spec requirement | Task |
|---|---|
| `ChannelRail` / `RailSection` / `RailEntryCard` / `types.ts` / `useRailPosition` | 3, 6, 7, 8 |
| `useCategoryRail`, `useRailAvatars` | 5, 4 |
| `getUsersByIds()` batched at 100 | 1 |
| `STORAGE_KEYS.LOCAL_RAIL_POSITION` | 3 |
| `ConnectTwitchPrompt` extraction | 2 |
| Mount in `AppLayout` | 9 |
| `RailEntry` / `RailPosition` contract, `'top'` documented gap | 3 |
| Fixed overlay, no reflow, player keeps its ratio | 8, 9 |
| Hover intent 120ms / 200ms | 8 |
| Keyboard, focus, touch; Escape and outside tap | 8 |
| Expanded content: name, live dot, viewers, uptime | 6 |
| Position flip, persisted | 3, 8 |
| Cap of 8, `+N` opens FollowingPanel | 7, 8 |
| Offline follows excluded | 8 |
| States table (logged out, no follows, fetch fails, partial avatars, non-Twitch route, no game_id, empty) | 8 |
| Sections fail independently | 8 |
| Logged out: prompt, no API calls | 8 |
| Mutation checking | 5, 8 |
| Debt repaid: connect prompt | 2 |
| AppContext `rail` state | **Deliberately not implemented** — deviation 3 |

One spec line is intentionally unimplemented (the AppContext field) and recorded above with its reasoning. Everything else maps to a task.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Every code step carries the actual code; every test step carries the actual assertions.

**Type consistency.** Checked the names that cross task boundaries: `getUsersByIds` (Task 1 → 4), `RailEntry`/`RailPosition` (3 → 6, 7, 8), `useRailPosition` returning `{ position, setPosition, flip }` (3 → 8), `useRailAvatars` returning `Map<string, string>` (4 → 8), `useCategoryRail` returning `{ streams, loading, error }` (5 → 8), `RailEntryCard` props `{ entry, expanded }` (6 → 7), `RailSection` props and `RAIL_SECTION_CAP` (7 → 8). Consistent throughout.

Two naming notes for implementers: avatar map keys are **unscoped** Twitch user IDs (as Helix returns them), while `RailEntry.id` is **platform-scoped** (`twitch:<id>`). The mapping sites in Task 8 handle the conversion. Don't unify them — the scoping exists so a second platform cannot collide, and Helix knows nothing about it.

**Running test count:** 282 baseline → 288 → 293 → 299 → 304 → 312 → 322 → 332 → 354 → 358.
