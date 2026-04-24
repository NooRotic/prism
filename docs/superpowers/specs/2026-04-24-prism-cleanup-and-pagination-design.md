# PRISM — Cleanup & Pagination Design

## Overview

Three work items: rename leftover `glaze_` localStorage keys to `prism_`, add progressive pagination to Your Stats panel cards, and extend the Following panel beyond its 400-follow cap with a load-more pattern and improved sorting.

---

## 1. localStorage Key Migration

### Constants Renamed

| Old Key | New Key | File |
|---------|---------|------|
| `glaze_onboarding_seen` | `prism_onboarding_seen` | `src/App.tsx` |
| `glaze_following_sort` | `prism_following_sort` | `src/contexts/AppContext.tsx` |
| `glaze_intros_seen` | `prism_intros_seen` | `src/hooks/useIntroState.ts` |
| `glaze_search_history` | `prism_search_history` | `src/lib/searchHistory.ts` |

`twitch_access_token` is NOT renamed — it's Twitch-scoped, not app-branded.

### Migration Shim

A `migrateLocalStorageKeys()` function in `src/App.tsx`, called once before any localStorage reads:

```typescript
function migrateLocalStorageKeys() {
  if (localStorage.getItem('prism_migrated')) return
  const keys = [
    ['glaze_onboarding_seen', 'prism_onboarding_seen'],
    ['glaze_following_sort', 'prism_following_sort'],
    ['glaze_intros_seen', 'prism_intros_seen'],
    ['glaze_search_history', 'prism_search_history'],
  ]
  for (const [oldKey, newKey] of keys) {
    const value = localStorage.getItem(oldKey)
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value)
      localStorage.removeItem(oldKey)
    }
  }
  localStorage.setItem('prism_migrated', '1')
}
```

Called at the top of the `App` component, before render. The `prism_migrated` flag prevents re-running on every load.

### Test Updates

Four test files need their key string assertions updated:
- `src/hooks/__tests__/useIntroState.test.ts`
- `src/lib/__tests__/searchHistory.test.ts`
- `src/contexts/__tests__/AppContext.test.tsx`
- Any onboarding tests referencing `glaze_onboarding_seen`

---

## 2. Your Stats — Expandable Cards with Load More

### Goal

Add progressive "Show more" pagination to stat cards that currently only fetch and display the first page.

### API Layer Changes (`src/lib/twitchApi.ts`)

Four functions gain an optional `after` cursor parameter and return cursor alongside data:

**`getBroadcasterSubscriptions`**
- Params: `broadcasterId, first?, after?`
- Returns: `{ data: TwitchBroadcasterSubscription[], total, points, cursor: string | null }`

**`getBroadcasterVIPs`**
- Params: `broadcasterId, first?, after?`
- Returns: `{ data: TwitchVIP[], cursor: string | null }`

**`getBroadcasterPolls`**
- Params: `broadcasterId, first?, after?`
- Returns: `{ data: TwitchPoll[], cursor: string | null }`

**`getBroadcasterPredictions`**
- Params: `broadcasterId, first?, after?`
- Returns: `{ data: TwitchPrediction[], cursor: string | null }`

All four follow the existing `getFollowedChannelsPage()` pattern — accept optional `after`, extract `pagination?.cursor ?? null`.

### Hook Changes (`src/hooks/useYourStats.ts`)

Per-section state extends to:

```typescript
interface SectionState<T> {
  data: T | null
  loading: boolean
  error: string | null
  cursor: string | null
  loadingMore: boolean
}
```

Each paginated section exposes a `loadMore()` function:
- Fetches the next page using stored cursor
- Appends results to existing data array
- Updates cursor (null when no more pages)
- Sets `loadingMore` during fetch

### UI Changes (`src/components/layout/YourStatsPanel.tsx`)

Each expandable card body receives `cursor`, `loadingMore`, and `loadMore` props:
- When `cursor` is non-null, render a "Show more" button at the bottom
- Button shows a spinner while `loadingMore` is true
- Newly loaded items append below existing ones

### Cards and Page Sizes

| Card | Initial Display | Load More Page Size |
|------|----------------|---------------------|
| Subscribers | 5 recent subs | 100 per page |
| VIPs | 8 VIP names | 100 per page |
| Polls | Latest poll | 5 per page |
| Predictions | Latest prediction | 25 per page |

### Not Paginated (no changes)

- **Follower count** — single number, no list
- **Goals** — typically 1-3 active, no pagination needed
- **Hype Trains** — 5 events sufficient
- **Bits Leaderboard** — fixed-size top-10

---

## 3. Following Panel — Load More & Improved Sorting

### Load More Beyond 400

**Current:** `MAX_FOLLOWS = 400` hard cap, cursor discarded after initial loop.

**New behavior:**
- Initial load fetches 400 follows as before (4 pages of 100)
- Cursor stored after initial loop instead of discarded
- When cursor is non-null, a "Load more" button renders at bottom of channel list
- Clicking fetches the next 100 follows, enriches with live status via `getStreamsByUserIds()`, appends to list
- Button reappears if there's still another page
- Count display: "Showing {loadedCount} of {totalCount}" when more exist

### Hook Changes (`src/hooks/useFollowedChannels.ts`)

- Remove `MAX_FOLLOWS` cap from initial loop (keep initial fetch at 400 via iteration count)
- Store cursor after initial loop
- Add `loadMore()` function: fetch one page, enrich with live status, append
- Expose: `{ channels, loading, loadingMore, cursor, loadMore, totalCount, loadedCount }`

### Sort Fix — Live Always On Top

All sort modes partition channels into **live first, then offline**. The sort order applies within each group independently.

### Asc/Desc Toggle

Sort control: dropdown for mode + arrow toggle button (▲/▼) for direction.

| Sort Mode | Asc (▲) | Desc (▼) |
|-----------|---------|----------|
| **Live first** | Fewest viewers → most | Most viewers → fewest *(default)* |
| **Alphabetical** | A → Z *(default)* | Z → A |
| **Most viewers** | Fewest → most | Most → fewest *(default)* |

Live-on-top partitioning applies in all cases. Asc/desc only affects order within each group.

### Sort Storage Format

`prism_following_sort` value format changes from bare mode to `mode:direction`:
- `'live-first:desc'` (default)
- `'alpha:asc'`
- `'viewers:desc'`

Migration handles bare old values: `'alpha'` → `'alpha:asc'`, `'viewers'` → `'viewers:desc'`, `'live-first'` → `'live-first:desc'`.

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/App.tsx` | Rename constant, add migration shim |
| `src/contexts/AppContext.tsx` | Rename constant, parse new sort format |
| `src/hooks/useIntroState.ts` | Rename constant |
| `src/lib/searchHistory.ts` | Rename constant |
| `src/lib/twitchApi.ts` | Add `after` param + cursor return to 4 functions |
| `src/hooks/useYourStats.ts` | Add cursor state + loadMore per section |
| `src/components/layout/YourStatsPanel.tsx` | Show more buttons on 4 card bodies |
| `src/hooks/useFollowedChannels.ts` | Store cursor, add loadMore, remove hard cap |
| `src/components/layout/FollowingPanel.tsx` | Load more button, sort fix, asc/desc toggle |
| Test files (4+) | Update key strings, add pagination tests |

## Not In Scope

- **Subscribed badges on Category panel** — requires `user:read:subscriptions` scope and N parallel per-broadcaster API calls. Deferred.
- **Twitch OAuth redirect URI update** — already completed by user in Twitch Developer Console.
