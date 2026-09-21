# Channel Rail — Design

**Date:** 2026-09-21
**Status:** Approved, not implemented
**Scope:** Twitch player page (`/twitch/:channel`)

---

## Problem

PRISM has no equivalent of Twitch's channel rail. Once you're watching a
channel there is no way to see who else you follow is live, and no way to
discover adjacent streamers, without leaving for twitch.tv.

PRISM *does* have a Following slide-down panel, but it is a browse surface:
you open it, scan, sort, and close. It answers "show me my follows." It does
not answer the glance-sized question — "who can I switch to right now" —
which is what the rail is for.

## Goals

1. Show followed channels that are live, at a glance, while watching.
2. Surface adjacent streamers in the same category, weighted to promote
   people beyond the top of the leaderboard.
3. **Preserve video space.** This is the governing constraint. Any design
   that costs meaningful player width loses.
4. Accommodate one rail per platform in future (YouTube, Kick) without
   restructuring.

## Non-goals

- Replacing the Following slide-down panel. It stays; see *Relationship to
  the Following panel*.
- Building the YouTube or Kick rails. See *Why only Twitch today*.
- A `top` rail position. Designed for, deliberately not built.

---

## Why only Twitch today

A YouTube rail is **not buildable** right now. `src/lib/youtubeApi.ts` is
API-key based (`VITE_YOUTUBE_API_KEY`, line 1) with no user OAuth, so PRISM
has no way to know who the signed-in user subscribes to. A YouTube follows
rail needs a full Google OAuth flow — consent screen, scopes, token storage,
refresh — none of which exists. Kick is further out still.

This is why the design is *structured* for N platforms but *builds* one. The
alternative — a provider registry — would mean deriving a plugin interface
from a single implementation, for platforms blocked behind unbuilt auth. The
one thing guaranteed wrong about an abstraction drawn from one example is the
abstraction.

What we commit to instead is the **data contract** (`RailEntry`), which can
be validated against real Twitch data today.

---

## Architecture

### Component tree

```
TwitchPlayerPage
└── ChannelRail                     position, gutter, section order
    ├── RailSection  (Twitch)       label + icon + entries
    │   └── RailEntryCard × n       avatar; expands on hover/focus
    └── RailSection  (Category)
        └── RailEntryCard × n
```

`RailSection` is platform-agnostic: it takes a label, an icon, and entries,
and knows nothing about where they came from. This is what makes a future
YouTube section additive — append a section, touch no existing code.

The primitive is justified by today's code, not by the future one: there are
already **two** sections (follows and recommendations), so it is factored
from two real cases.

### Files

**New**

| File | Purpose |
|---|---|
| `src/components/rail/ChannelRail.tsx` | Strip shell: position, gutter width, section ordering, empty-collapse |
| `src/components/rail/RailSection.tsx` | One labelled group of avatars |
| `src/components/rail/RailEntryCard.tsx` | One avatar; collapsed circle + expanded overlay panel |
| `src/components/rail/types.ts` | `RailEntry`, `RailPosition` |
| `src/components/rail/useRailPosition.ts` | Reads/writes `prism_rail_position` |
| `src/hooks/useCategoryRail.ts` | Top-3 + random-sample recommendations |

**Modified**

| File | Change |
|---|---|
| `src/pages/TwitchPlayerPage.tsx` | Mount rail, wrap content in flex row |

### Data contract

```ts
export interface RailEntry {
  id: string                 // platform-scoped: "twitch:71092938"
  displayName: string
  avatarUrl: string
  href: string               // in-app route: /twitch/xqc
  isLive: boolean
  viewerCount: number | null
  streamTitle: string | null
  gameName: string | null
  startedAt: string | null   // ISO 8601; drives uptime
}

export type RailPosition = 'left' | 'right' | 'top'
```

IDs are platform-scoped so they cannot collide when a second platform is
added.

`'top'` is in the union deliberately. Only `left` and `right` are
implemented; `top` is an explicit, documented gap rather than a silent
fallthrough, so the seam is visible to the next person who opens the file.

### Data flow

**Twitch section.** `useFollowedChannels` already returns everything
`RailEntry` needs — `EnrichedFollow` carries `isLive`, `viewerCount`,
`gameName`, `streamTitle`, `thumbnailUrl`, `startedAt`. The Twitch section is
a **mapping function over an existing hook**. No new Twitch API calls, no new
quota.

**Category section.** `useCategoryRail(gameId, excludeUserId)` calls the
existing `getStreamsByGameId`, then:

1. Sort by `viewer_count` descending.
2. Take the **top 3**.
3. Randomly sample **up to 5** from the remainder.
4. Exclude the currently-playing channel.
5. **Memoize on `gameId`.**

Step 5 is load-bearing. An unmemoized random sample reshuffles on every
render, so the rail rearranges under the cursor while you are reaching for an
avatar. A shuffling rail is unusable.

Step 2/3 together are the point of the feature: the user explicitly wants to
promote streamers beyond the top-of-the-top, so the list is deliberately not
a pure leaderboard.

The 3 + 5 split is chosen to total the per-section cap of 8 (see *Overflow*),
so the recommendations section never truncates and never shows a `+N` — it is
already the full set by construction. Changing either number should keep that
relationship or the two rules will disagree.

---

## Layout and interaction

### Gutter

`TwitchPlayerPage` becomes a flex row — rail, then the existing vertical
stack. The rail is `position: sticky` to the viewport, so it stays reachable
while scrolling to clips and VODs. A channel switcher you must scroll back up
to reach is not a switcher.

Collapsed width ~60px. The player column is that much narrower; **nothing
ever covers the video**.

### Expansion

Expansion overlays the player. The collapsed strip lives in the gutter, so
hover *begins* outside the Twitch iframe — the panel then overlays it at a
raised z-index.

This ordering is not incidental. An iframe swallows mouse events, so a design
requiring hover *over* the player to trigger the rail would be unreliable.
The gutter decision avoids the problem entirely.

### Hover intent

Two delays:

- **~120ms before expanding** — sweeping the cursor past a vertical stack of
  avatars must not strobe panels open.
- **~200ms before collapsing** — diagonal travel from avatar to panel must
  not dismiss it mid-move.

Without both, a column of hover targets is unpleasant to use.

### Keyboard

Focus expands the same panel as hover. Each entry is a link. Hover-only would
make the rail unreachable by keyboard; the repo's accessibility is otherwise
reasonable and the rail should not be what breaks it.

### Expanded content

Display name, live dot, viewer count, and **stream uptime**. Uptime reuses
`StreamUptime` and `formatUptime` from PR #46 directly — same component, same
formatting, no duplication.

### Position

Persisted at `prism_rail_position`. A small flip control in the rail footer
toggles left/right.

Note for implementation: this key joins the eight already catalogued in
`docs/TECH-DEBT.md` under "localStorage key sprawl." It should be added to
that list, not quietly appended to the pile.

### Overflow

Each section has a **fixed maximum of 8 entries**, not a measured
viewport fit. A `+N` control below a truncated section opens the existing
`FollowingPanel`, where `N` is the number hidden.

A fixed cap rather than dynamic measurement, for three reasons: measuring
requires a resize observer and a layout pass that can flicker on load; two
sections competing for measured space needs an allocation rule that is
arbitrary either way; and a stable, predictable number of avatars is easier
to build muscle memory against. If 8 proves wrong in use it is one constant
to change.

With both sections at cap the strip is 16 avatars plus two section heads,
which fits a 900px viewport at 60px pitch. Shorter viewports scroll the rail
internally; the sticky container scrolls, the page does not.

### Offline follows

Excluded. The rail answers "who can I switch to right now." Offline channels
belong in the panel.

---

## States

| State | Behaviour |
|---|---|
| Logged out | Rail not rendered. No gutter; player takes full width. |
| Loading follows | Dimmed placeholder circles at full gutter width, so the player does not resize when data lands. |
| No follows live | Follows section hidden; recommendations still render. |
| Follows fetch fails | Follows section hidden; recommendations unaffected. |
| Channel offline / no `game_id` | Recommendations hidden — no category to draw from. |
| Neither section has content | Rail unmounts; gutter collapses to zero. |

### Invariant: sections fail independently

One section's data failing — expired token, API error, empty result — hides
that section and leaves the others intact. This is the concrete payoff for
not merging platforms into a single hook, and it becomes a multi-platform
guarantee once there is a second platform: YouTube's auth lapsing must not
blank the Twitch rail.

This is a tested invariant, not an aspiration.

### Logged-out behaviour

The rail is hidden entirely when logged out. Both halves need a Twitch token
— Helix requires one on every endpoint, including public data — so there is
genuinely nothing to show.

This is deliberately *not* solved by showing demo channels. Presenting
placeholder content as if it were the user's real follow list is the same
error as Defect #5 (see below).

---

## Relationship to the Following panel

Both surfaces stay. They differ in scope and in job:

| | Rail | Following panel |
|---|---|---|
| Mounted in | `TwitchPlayerPage` | `AppLayout` (global) |
| Job | Glance and switch | Browse and sort |
| Shows | Live only | Live and offline |
| Controls | None | Sort, pagination |

The rail's `+N` overflow control opens the panel, which makes the division
explicit in the UI rather than leaving two similar surfaces to drift apart.

---

## Dependency: Defect #5 ships first

The logged-out Twitch player page currently renders `StatsRow` with
**CLIPS 0 / HOURS STREAMED 0.0 / 0 VODs / ENGAGEMENT 0.0**, which reads as
fact and is false. Root cause: `TwitchPlayerPage.tsx:64` gates fetching on
auth —

```ts
const channelForApi = isAuthenticated ? (channel ?? null) : null
```

— so `state.channel.profile` stays null, `ProfileSidebar` early-returns at
line 101, and `StatsRow` renders zeros rather than an unknown state.

The missing data is a real API constraint. Rendering zeros instead of a
connect prompt is ours.

This is fixed **before** the rail, as its own PR. It is listed here because
the rail's logged-out behaviour must be consistent with whatever that fix
establishes — both are answers to "what does a signed-out visitor see," and
they should not be designed separately.

---

## Testing

The last three defects shipped because tests covered *behaviour* but never
asserted what **renders**. The rail's tests target output.

- Rail absent when logged out
- One avatar per live follow; offline follows excluded
- Expanded panel shows name, live dot, viewer count, and uptime
- Focus expands, not only hover
- `+N` appears past capacity and opens `FollowingPanel`
- Position flips left/right and survives reload
- Recommendations: top 3 ordered by viewers, current channel excluded
- Recommendations stable across re-renders
- A failing section does not hide its siblings

**On testing randomness.** The sample is not pinned to exact picks — that is
either flaky or requires injecting a seed for no real benefit. Tests assert
the properties that matter: correct length, disjoint from the top 3, drawn
from the fetched pool, and **identical across re-renders**. The stability
assertion is the one that stops a shuffling rail shipping.

**Mutation checking.** Each test is verified by reintroducing the defect it
guards and confirming it fails, as was done for PR #46. A regression test
never observed failing is not yet known to work.

---

## Open questions

None blocking. Deferred by decision:

- `top` rail position — designed for, not built; no rollover state defined yet.
- YouTube and Kick sections — blocked on OAuth that does not exist.
