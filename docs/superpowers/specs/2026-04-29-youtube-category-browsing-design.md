# PRISM — YouTube Category Browsing Design

> Recovered from lost session 2026-04-29 (original session ~2026-04-28, ID unknown).
> All 5 design sections were approved by the user. Implementation never started — session crashed after final "yes, proceed".
> Design approach: **Approach B (Layered)** — cache service + UI components. Approved over monolithic (A) and context-driven (C).

---

## Overview

Extend the YouTube protocol page from a flat grid of 12 popular videos into a **categorized browsing experience** with:
- 6 category pills with hover-expand descriptions
- 24-hour localStorage cache per category with TTL
- Pagination via YouTube API `nextPageToken`
- YouTube videoId extraction in URL detection
- Removal of hardcoded `yt-1/2/3` demo entries

### Architecture (Approach B — Layered)

```
src/config/youtubeCategories.ts     ← category definitions (data)
src/lib/youtubeCache.ts             ← pure cache service (logic)
src/components/ui/ExpandablePill.tsx ← reusable pill component (UI)
src/components/grid/YouTubeCategoryBar.tsx ← YouTube pill row (UI)
src/components/grid/YouTubeGrid.tsx  ← extended with categories + pagination (UI)
src/lib/youtubeApi.ts               ← pagination support added (logic)
src/lib/urlDetection.ts             ← videoId extraction added (logic)
src/config/demoContent.ts           ← yt-1/2/3 entries removed (data)
```

### Future Phase (Noted, Not Built)

- Shared cache across users via serverless proxy/CDN layer (user A fetches "Dev AI News", user B gets cached results)
- Playlist/embed URL format support in videoId patterns
- Player page enrichment (related videos, YouTube Live Chat)

---

## Section 1: Category Config & Data Model

**File:** `src/config/youtubeCategories.ts`

A flat array of preset category objects. Single file to edit for category changes.

```typescript
interface YouTubeCategory {
  id: string              // stable key for cache + pill identity
  label: string           // short pill text: "Dev AI News"
  description: string     // hover-expand text: "AI tools, models, and developer news"
  searchQuery: string     // exact string sent to YouTube search API
  icon: string            // lucide icon name: "bot", "code", "gamepad-2", "music", "monitor"
}
```

### The 6 Presets

| id | label | searchQuery | icon |
|----|-------|-------------|------|
| `popular` | Popular | *(no search — uses `mostPopular` endpoint, 1 unit)* | `flame` |
| `dev-ai` | Dev AI News | `"Latest Dev AI News"` | `bot` |
| `live-coding` | Live Coding | `"Live coding programming"` | `code` |
| `gaming` | Gaming | `"Gaming highlights"` | `gamepad-2` |
| `music` | Music | `"Music videos"` | `music` |
| `tech-reviews` | Tech Reviews | `"Tech review 2026"` | `monitor` |

**`popular` is special** — default active category, uses the cheap `getPopularVideos()` call (1 unit) instead of `searchYouTubeVideos()` (100 units). The component layer checks `category.id === 'popular'` to pick the right API function.

---

## Section 2: Cache Service

**File:** `src/lib/youtubeCache.ts`

Pure utility — no React, no side effects beyond localStorage. Fully testable in isolation.

### Cache Key Format

`prism_yt_cache_{categoryId}` — follows existing `prism_` prefix convention (`prism_panel_ratio`, `prism_search_history`, etc.)

### Stored Shape

```typescript
interface CachedYouTubeResults {
  videos: YouTubeVideo[]        // all pages loaded so far, appended in order
  nextPageToken: string | null  // YouTube API cursor for "Load More"
  timestamp: number             // Date.now() at time of fetch
  query: string                 // the search query that produced these results (for integrity)
}
```

### Exported Functions

| Function | Purpose |
|----------|---------|
| `getCachedResults(categoryId)` | Returns cached data if exists and not expired, else `null` |
| `setCachedResults(categoryId, data)` | Writes to localStorage |
| `appendCachedPage(categoryId, newVideos, nextPageToken)` | Appends a paginated page to existing cache entry |
| `invalidateCache(categoryId)` | Removes a single category's cache (per-pill refresh) |
| `invalidateAllCache()` | Removes all `prism_yt_cache_*` keys (global refresh) |
| `isCacheExpired(categoryId)` | Checks TTL — `true` if older than 24 hours or missing |

### TTL

```typescript
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
```

### Edge Cases

- **Corrupted JSON in localStorage** → catch parse error, return `null` (treat as cache miss)
- **localStorage full** → catch `QuotaExceededError` on write, log warning, continue without caching
- **Query mismatch** (preset's `searchQuery` changed but old cache exists) → the `query` field lets the consumer detect this and invalidate

---

## Section 3: ExpandablePill Component

**File:** `src/components/ui/ExpandablePill.tsx`

A **reusable** component — not YouTube-specific. The YouTube category bar composes a row of these.

### Props

```typescript
interface ExpandablePillProps {
  label: string
  description?: string
  icon?: React.ReactNode       // pre-rendered lucide icon from parent
  active?: boolean
  accentColor?: string         // CSS var like "var(--accent-youtube)"
  onClick?: () => void
}
```

### Behavior

| State | Appearance |
|-------|------------|
| **Default** | Compact pill — icon + label, `rounded-full`, subtle border |
| **Hover** | Smoothly expands downward to reveal description text below label. CSS transition on `max-height` + `opacity` (~200ms ease-out). Not `height` — avoids layout thrash. |
| **Active** | Filled background with accent color at low opacity, accent-colored border. Label at full opacity. |
| **Inactive** | Ghost style — `bg-transparent`, muted border, muted text |
| **Keyboard** | Focusable, activates on Enter/Space |

### Expand Mechanic

A wrapper div contains two children:
1. **Pill row** — icon + label (always visible)
2. **Description div** — `max-height: 0; opacity: 0; overflow: hidden` by default, transitions to `max-height: 3rem; opacity: 1` on hover via group-hover or local hover state

### DESIGN-LAWS Compliance

- No glassmorphism, no gratuitous shadows
- `rounded-full` for pills (appropriate tier for small interactive elements)
- Motion communicates state change (expand = "here's more info")
- Color is semantic via `accentColor` prop

### Reusability

This component has zero YouTube knowledge. Reusable for HLS/DASH categories, Twitch tags, or anything else later.

---

## Section 4: YouTubeCategoryBar & Grid Integration

### YouTubeCategoryBar

**File:** `src/components/grid/YouTubeCategoryBar.tsx`

Thin wrapper that maps the category config array into a horizontal row of `<ExpandablePill>` components.

```typescript
interface YouTubeCategoryBarProps {
  activeId: string
  onSelect: (categoryId: string) => void
  onRefresh: (categoryId: string) => void   // per-pill refresh button
}
```

**Layout:** Horizontal flex row with `gap-2`, `overflow-x-auto` on mobile (pills scroll horizontally if they overflow). A small refresh icon (lucide `refresh-cw`, 12px) appears on the **active pill** — clicking it calls `onRefresh(activeId)`.

### YouTubeGrid — Extended

**File:** `src/components/grid/YouTubeGrid.tsx`

Currently fetches 12 popular videos on mount. Reworked to support categories, caching, and pagination.

#### New State

```typescript
const [activeCategory, setActiveCategory] = useState('popular')
const [videos, setVideos] = useState<YouTubeVideo[]>([])
const [loading, setLoading] = useState(true)
const [loadingMore, setLoadingMore] = useState(false)  // for pagination
const [nextPageToken, setNextPageToken] = useState<string | null>(null)
const [error, setError] = useState<string | null>(null)
```

#### Flow on Category Change

1. Check `getCachedResults(categoryId)`
2. **Cache hit + not expired** → load from cache, set `videos` + `nextPageToken`, no API call
3. **Cache miss or expired** → fetch from API, `setCachedResults()`, render
4. `popular` → calls `getPopularVideos()` (1 unit). Others → calls `searchYouTubeVideos(category.searchQuery)` (100 units)

#### "Load More" Button

- Visible when `nextPageToken !== null`
- Fetches next page, calls `appendCachedPage()` to update cache, appends to `videos` state
- Shows a spinner while `loadingMore` is true

#### "Refresh All" Button

- Positioned top-right of the grid area
- Calls `invalidateAllCache()`, then re-fetches active category
- Small text label + refresh icon

#### Render Structure

```tsx
<YouTubeCategoryBar />       {/* pills row */}
<div className="grid ...">   {/* video cards (existing) */}
  {videos.map(v => <YouTubeVideoCard />)}
</div>
{nextPageToken && <LoadMoreButton />}  {/* pagination */}
```

---

## Section 5: URL Detection & Pagination API Changes

### urlDetection.ts — videoId Extraction

Currently `isYouTubeURL()` returns a boolean but never populates `metadata.videoId`. Add a pattern registry:

```typescript
const YOUTUBE_ID_PATTERNS: Array<{ regex: RegExp; idGroup: number }> = [
  { regex: /youtube\.com\/watch\?.*v=([^&]+)/, idGroup: 1 },
  { regex: /youtu\.be\/([^?/]+)/, idGroup: 1 },
  { regex: /youtube\.com\/live\/([^?/]+)/, idGroup: 1 },
  { regex: /youtube\.com\/shorts\/([^?/]+)/, idGroup: 1 },
]
```

New function: `extractYouTubeVideoId(url: string): string | null` — iterates the array, returns first match. To add a new format later, just push another object.

`detectURLType()` updated: when `type === 'youtube'`, calls `extractYouTubeVideoId()` and sets `metadata.videoId`. This fixes `getContentId()` in PlayerHost returning `null` for YouTube URLs.

### youtubeApi.ts — Pagination Support

Both `getPopularVideos()` and `searchYouTubeVideos()` accept and return page tokens:

```typescript
interface YouTubePagedResult {
  videos: YouTubeVideo[] | YouTubeSearchResult[]
  nextPageToken: string | null
}
```

- Add optional `pageToken?: string` param to both functions
- Pass it as `pageToken` in the `URLSearchParams` when present
- Return `{ videos, nextPageToken: data.nextPageToken ?? null }` instead of just the array

**Breaking change** to the return type — `YouTubeGrid` and `YoutubePlayerPage` (which calls `getVideoDetails`) need updating. `getVideoDetails` stays unchanged since it doesn't paginate.

### demoContent.ts — Cleanup

Remove the dead `yt-1`, `yt-2`, `yt-3` hardcoded entries. `YoutubePlayerPage` still calls `getDemoById(videoId)` as a fallback — after removal, that just returns `undefined` and falls through to the real YouTube URL construction. No behavior change.

### .env.example — Documentation

Add `VITE_YOUTUBE_API_KEY=` entry (if not already present).

---

## Quota Strategy

| Action | API Call | Units | Frequency |
|--------|----------|-------|-----------|
| Load Popular tab | `videos/list?chart=mostPopular` | 1 | Once per 24h (cached) |
| Load a search category | `search/list?q=...` | 100 | Once per 24h per category (cached) |
| Load More (popular) | `videos/list` + `pageToken` | 1 | On demand |
| Load More (search) | `search/list` + `pageToken` | 100 | On demand |
| Refresh single category | Same as above | 1 or 100 | Manual only |
| Refresh all | Up to 501 if all cached | Max 501 | Manual only |

**Worst case daily:** All 6 categories loaded + 1 refresh each = ~1,002 units (well within 10,000 free tier).
**Typical case:** Popular + 1-2 search categories = ~201 units.

---

## Files Changed Summary

| File | Action | Changes |
|------|--------|---------|
| `src/config/youtubeCategories.ts` | **Create** | Category definitions array + interface |
| `src/lib/youtubeCache.ts` | **Create** | Cache service (6 exported functions, TTL, edge cases) |
| `src/components/ui/ExpandablePill.tsx` | **Create** | Reusable hover-expand pill component |
| `src/components/grid/YouTubeCategoryBar.tsx` | **Create** | Horizontal pill bar wrapping ExpandablePill |
| `src/components/grid/YouTubeGrid.tsx` | **Modify** | Add categories, cache integration, pagination, Load More |
| `src/lib/youtubeApi.ts` | **Modify** | Add `pageToken` param + `YouTubePagedResult` return type |
| `src/lib/urlDetection.ts` | **Modify** | Add `extractYouTubeVideoId()`, populate `metadata.videoId` |
| `src/config/demoContent.ts` | **Modify** | Remove `yt-1`, `yt-2`, `yt-3` entries |
| Test files | **Create/Modify** | Tests for cache service, pills, pagination, videoId extraction |

---

## Decisions Log

| Question | Decision | Rationale |
|----------|----------|-----------|
| Architecture approach | Layered (B) over Monolithic (A) or Context (C) | Each piece independently testable, cache reusable for future shared-cache proxy |
| Default category | `popular` | Cheapest API call (1 unit), most broadly appealing |
| Cache TTL | 24 hours | Balances freshness vs quota conservation |
| ExpandablePill scope | Generic, not YouTube-specific | Reusable for other protocol pages, tags, etc. |
| Pagination model | `nextPageToken` cursor-based | Matches YouTube API's native pagination |
| videoId extraction | Pattern registry array | Easy to extend with new URL formats |
| Dead demo removal | Remove `yt-1/2/3` | Replaced by live API data, fallback still works |
| Shared user cache | Deferred to future phase | Requires serverless proxy, overengineered for now |
