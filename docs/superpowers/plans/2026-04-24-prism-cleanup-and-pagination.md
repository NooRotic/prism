# PRISM Cleanup & Pagination — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename `glaze_` localStorage keys to `prism_` with a migration shim, add "Show more" pagination to four Your Stats cards, and extend the Following panel beyond its 400-follow cap with a load-more button and improved live-first sorting with asc/desc toggle.

**Architecture:** localStorage migration runs once at app boot via a flag. Your Stats cards gain per-section cursor state and a `loadMore()` callback that appends the next API page. Following panel stores the cursor after its initial 400-follow fetch and exposes a `loadMore()` for incremental pages. Sort is refactored to always partition live-above-offline, with an asc/desc direction toggle persisted in the sort key format.

**Tech Stack:** React 19, TypeScript, Vitest, Twitch Helix API (cursor-based pagination)

---

## Task 1: Rename localStorage constants + migration shim

**Files:**
- Modify: `src/App.tsx:19` (ONBOARDING_SEEN_KEY constant)
- Modify: `src/contexts/AppContext.tsx:24` (FOLLOWING_SORT_STORAGE_KEY constant)
- Modify: `src/hooks/useIntroState.ts:4` (STORAGE_KEY constant)
- Modify: `src/lib/searchHistory.ts:1` (STORAGE_KEY constant)

- [ ] **Step 1: Update the four STORAGE_KEY constants**

In `src/lib/searchHistory.ts` line 1:
```typescript
const STORAGE_KEY = 'prism_search_history'
```

In `src/hooks/useIntroState.ts` line 4:
```typescript
const STORAGE_KEY = 'prism_intros_seen'
```

In `src/contexts/AppContext.tsx` line 24:
```typescript
const FOLLOWING_SORT_STORAGE_KEY = 'prism_following_sort'
```

In `src/App.tsx` line 19:
```typescript
const ONBOARDING_SEEN_KEY = 'prism_onboarding_seen'
```

- [ ] **Step 2: Add migration shim to App.tsx**

Add this function above the `AppInner` component (before line 21):

```typescript
function migrateLocalStorageKeys() {
  if (localStorage.getItem('prism_migrated')) return
  const keys: [string, string][] = [
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

migrateLocalStorageKeys()
```

Call `migrateLocalStorageKeys()` at module scope (not inside a component) so it runs once before any component mounts.

- [ ] **Step 3: Update test files**

In `src/lib/__tests__/searchHistory.test.ts`, update lines 60-62:
```typescript
  it('persists via localStorage key prism_search_history', () => {
    saveSearchEntry({ query: 'test', type: 'channel', timestamp: 1000 })
    const raw = localStorage.getItem('prism_search_history')
```

In `src/hooks/__tests__/useIntroState.test.ts`, update all `'glaze_intros_seen'` references (lines 46, 56, 97, 103) to `'prism_intros_seen'`:
```typescript
    // line 46
    const stored = JSON.parse(localStorage.getItem('prism_intros_seen')!)

    // line 55-57
    localStorage.setItem(
      'prism_intros_seen',
      JSON.stringify({ shroud: 'cinematic' }),
    )

    // line 97
    const stored = JSON.parse(localStorage.getItem('prism_intros_seen')!)

    // line 102-104
    localStorage.setItem(
      'prism_intros_seen',
      JSON.stringify({ shroud: 'cinematic' }),
    )
```

In `src/contexts/__tests__/AppContext.test.tsx`, update lines 410, 416:
```typescript
      expect(localStorage.getItem('prism_following_sort')).toBe('viewers')
      // ...
      expect(localStorage.getItem('prism_following_sort')).toBe('alpha')
```

- [ ] **Step 4: Run tests to verify**

Run: `npx vitest run`
Expected: All 171+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/contexts/AppContext.tsx src/hooks/useIntroState.ts src/lib/searchHistory.ts src/lib/__tests__/searchHistory.test.ts src/hooks/__tests__/useIntroState.test.ts src/contexts/__tests__/AppContext.test.tsx
git commit -m "refactor: rename glaze_ localStorage keys to prism_ with migration shim"
```

---

## Task 2: Add cursor support to four twitchApi.ts functions

**Files:**
- Modify: `src/lib/twitchApi.ts:288-377` (four API functions)

- [ ] **Step 1: Update `getBroadcasterSubscriptions` (lines 288-303)**

Replace the function with:

```typescript
export async function getBroadcasterSubscriptions(
  broadcasterId: string,
  first: number = 100,
  after?: string,
): Promise<TwitchBroadcasterSubscriptionsResponse> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const data =
    await twitchApiFetch<TwitchBroadcasterSubscriptionsResponse>(
      'subscriptions',
      params,
    )
  return {
    data: data.data ?? [],
    total: data.total ?? 0,
    points: data.points ?? 0,
    pagination: data.pagination,
  }
}
```

- [ ] **Step 2: Update `getBroadcasterVIPs` (lines 316-325)**

Replace the function with:

```typescript
export async function getBroadcasterVIPs(
  broadcasterId: string,
  first: number = 100,
  after?: string,
): Promise<{ data: TwitchVIP[]; cursor: string | null }> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const response = await twitchApiFetch<{
    data: TwitchVIP[]
    pagination?: { cursor?: string }
  }>('channels/vips', params)
  return {
    data: response.data ?? [],
    cursor: response.pagination?.cursor ?? null,
  }
}
```

- [ ] **Step 3: Update `getBroadcasterPolls` (lines 356-365)**

Replace the function with:

```typescript
export async function getBroadcasterPolls(
  broadcasterId: string,
  first: number = 20,
  after?: string,
): Promise<{ data: TwitchPoll[]; cursor: string | null }> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const response = await twitchApiFetch<{
    data: TwitchPoll[]
    pagination?: { cursor?: string }
  }>('polls', params)
  return {
    data: response.data ?? [],
    cursor: response.pagination?.cursor ?? null,
  }
}
```

- [ ] **Step 4: Update `getBroadcasterPredictions` (lines 368-377)**

Replace the function with:

```typescript
export async function getBroadcasterPredictions(
  broadcasterId: string,
  first: number = 25,
  after?: string,
): Promise<{ data: TwitchPrediction[]; cursor: string | null }> {
  const params: Record<string, string> = {
    broadcaster_id: broadcasterId,
    first: String(first),
  }
  if (after) params.after = after
  const response = await twitchApiFetch<{
    data: TwitchPrediction[]
    pagination?: { cursor?: string }
  }>('predictions', params)
  return {
    data: response.data ?? [],
    cursor: response.pagination?.cursor ?? null,
  }
}
```

- [ ] **Step 5: Run tests to verify**

Run: `npx vitest run`
Expected: All tests pass (no existing tests directly test these API functions with mocks — they're integration-level).

- [ ] **Step 6: Commit**

```bash
git add src/lib/twitchApi.ts
git commit -m "feat(api): add cursor pagination to subs/VIPs/polls/predictions endpoints"
```

---

## Task 3: Add loadMore to useYourStats hook

**Files:**
- Modify: `src/hooks/useYourStats.ts`

- [ ] **Step 1: Extend SectionState with cursor + loadingMore**

Replace the `SectionState` interface (lines 30-34) with:

```typescript
export interface SectionState<T> {
  data: T | null
  loading: boolean
  error: string | null
  cursor: string | null
  loadingMore: boolean
}
```

- [ ] **Step 2: Update emptySection helper**

Replace `emptySection` (lines 51-53):

```typescript
function emptySection<T>(): SectionState<T> {
  return { data: null, loading: false, error: null, cursor: null, loadingMore: false }
}
```

- [ ] **Step 3: Update runSection to return cursor**

Replace `runSection` (lines 87-108) to accept and return cursor:

```typescript
async function runSection<T>(
  fetcher: () => Promise<T>,
  onSessionExpired: () => void,
  cursor: string | null = null,
): Promise<SectionState<T>> {
  try {
    const data = await fetcher()
    return { data, loading: false, error: null, cursor, loadingMore: false }
  } catch (err) {
    if (err instanceof SessionExpiredError) {
      onSessionExpired()
      return { data: null, loading: false, error: err.message, cursor: null, loadingMore: false }
    }
    return {
      data: null,
      loading: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load section',
      cursor: null,
      loadingMore: false,
    }
  }
}
```

- [ ] **Step 4: Add loadMore functions to the hook return type**

Add to the `UseYourStatsReturn` interface (after line 79):

```typescript
interface UseYourStatsReturn {
  stats: YourStatsData
  loading: boolean
  sessionError: boolean
  refetch: () => void
  loadMoreSubs: () => Promise<void>
  loadMoreVIPs: () => Promise<void>
  loadMorePolls: () => Promise<void>
  loadMorePredictions: () => Promise<void>
}
```

- [ ] **Step 5: Refactor fetchAll to store cursors**

In the `fetchAll` callback, update the subscribers section (around lines 168-189) to capture the cursor from the API response:

```typescript
        promises.push(
          (async () => {
            const authError = () => cb.current.options?.handleAuthError?.()
            try {
              const response = await getBroadcasterSubscriptions(id, 100)
              const cursor = response.pagination?.cursor ?? null
              setStats((prev) => ({
                ...prev,
                subscribers: {
                  data: {
                    total: response.total,
                    points: response.points,
                    recent: response.data.slice(0, 5),
                  },
                  loading: false,
                  error: null,
                  cursor,
                  loadingMore: false,
                },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) authError()
              setStats((prev) => ({
                ...prev,
                subscribers: {
                  data: null,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Failed to load',
                  cursor: null,
                  loadingMore: false,
                },
              }))
            }
          })(),
        )
```

Update VIPs section (around lines 197-200):
```typescript
        promises.push(
          (async () => {
            const authError = () => cb.current.options?.handleAuthError?.()
            try {
              const response = await getBroadcasterVIPs(id, 100)
              setStats((prev) => ({
                ...prev,
                vips: {
                  data: response.data,
                  loading: false,
                  error: null,
                  cursor: response.cursor,
                  loadingMore: false,
                },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) authError()
              setStats((prev) => ({
                ...prev,
                vips: {
                  data: null,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Failed to load',
                  cursor: null,
                  loadingMore: false,
                },
              }))
            }
          })(),
        )
```

Update polls section (around lines 210-213):
```typescript
        promises.push(
          (async () => {
            const authError = () => cb.current.options?.handleAuthError?.()
            try {
              const response = await getBroadcasterPolls(id, 5)
              setStats((prev) => ({
                ...prev,
                polls: {
                  data: response.data,
                  loading: false,
                  error: null,
                  cursor: response.cursor,
                  loadingMore: false,
                },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) authError()
              setStats((prev) => ({
                ...prev,
                polls: {
                  data: null,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Failed to load',
                  cursor: null,
                  loadingMore: false,
                },
              }))
            }
          })(),
        )
```

Update predictions section (around lines 216-220):
```typescript
        promises.push(
          (async () => {
            const authError = () => cb.current.options?.handleAuthError?.()
            try {
              const response = await getBroadcasterPredictions(id, 5)
              setStats((prev) => ({
                ...prev,
                predictions: {
                  data: response.data,
                  loading: false,
                  error: null,
                  cursor: response.cursor,
                  loadingMore: false,
                },
              }))
            } catch (err) {
              if (err instanceof SessionExpiredError) authError()
              setStats((prev) => ({
                ...prev,
                predictions: {
                  data: null,
                  loading: false,
                  error: err instanceof Error ? err.message : 'Failed to load',
                  cursor: null,
                  loadingMore: false,
                },
              }))
            }
          })(),
        )
```

The non-paginated sections (followerCount, goals, hypeTrains, bits) continue to use `runSection` unchanged — they'll just get `cursor: null` from the updated helper.

- [ ] **Step 6: Add loadMore functions**

After `fetchAll`, before the `useEffect`, add these four callbacks:

```typescript
  const loadMoreSubs = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.subscribers.cursor
    if (!currentCursor) return
    setStats((prev) => ({
      ...prev,
      subscribers: { ...prev.subscribers, loadingMore: true },
    }))
    try {
      const response = await getBroadcasterSubscriptions(broadcasterId, 100, currentCursor)
      setStats((prev) => ({
        ...prev,
        subscribers: {
          ...prev.subscribers,
          data: prev.subscribers.data
            ? {
                ...prev.subscribers.data,
                recent: [...prev.subscribers.data.recent, ...response.data],
              }
            : null,
          cursor: response.pagination?.cursor ?? null,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({
        ...prev,
        subscribers: { ...prev.subscribers, loadingMore: false },
      }))
    }
  }, [broadcasterId, stats.subscribers.cursor])

  const loadMoreVIPs = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.vips.cursor
    if (!currentCursor) return
    setStats((prev) => ({
      ...prev,
      vips: { ...prev.vips, loadingMore: true },
    }))
    try {
      const response = await getBroadcasterVIPs(broadcasterId, 100, currentCursor)
      setStats((prev) => ({
        ...prev,
        vips: {
          ...prev.vips,
          data: prev.vips.data ? [...prev.vips.data, ...response.data] : response.data,
          cursor: response.cursor,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({
        ...prev,
        vips: { ...prev.vips, loadingMore: false },
      }))
    }
  }, [broadcasterId, stats.vips.cursor])

  const loadMorePolls = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.polls.cursor
    if (!currentCursor) return
    setStats((prev) => ({
      ...prev,
      polls: { ...prev.polls, loadingMore: true },
    }))
    try {
      const response = await getBroadcasterPolls(broadcasterId, 5, currentCursor)
      setStats((prev) => ({
        ...prev,
        polls: {
          ...prev.polls,
          data: prev.polls.data ? [...prev.polls.data, ...response.data] : response.data,
          cursor: response.cursor,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({
        ...prev,
        polls: { ...prev.polls, loadingMore: false },
      }))
    }
  }, [broadcasterId, stats.polls.cursor])

  const loadMorePredictions = useCallback(async () => {
    if (!broadcasterId) return
    const currentCursor = stats.predictions.cursor
    if (!currentCursor) return
    setStats((prev) => ({
      ...prev,
      predictions: { ...prev.predictions, loadingMore: true },
    }))
    try {
      const response = await getBroadcasterPredictions(broadcasterId, 5, currentCursor)
      setStats((prev) => ({
        ...prev,
        predictions: {
          ...prev.predictions,
          data: prev.predictions.data
            ? [...prev.predictions.data, ...response.data]
            : response.data,
          cursor: response.cursor,
          loadingMore: false,
        },
      }))
    } catch {
      setStats((prev) => ({
        ...prev,
        predictions: { ...prev.predictions, loadingMore: false },
      }))
    }
  }, [broadcasterId, stats.predictions.cursor])
```

- [ ] **Step 7: Update the return statement**

Replace the return (line 269):

```typescript
  return { stats, loading, sessionError, refetch, loadMoreSubs, loadMoreVIPs, loadMorePolls, loadMorePredictions }
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useYourStats.ts
git commit -m "feat(stats): add loadMore pagination to subs/VIPs/polls/predictions sections"
```

---

## Task 4: Add "Show more" buttons to YourStatsPanel

**Files:**
- Modify: `src/components/layout/YourStatsPanel.tsx`

- [ ] **Step 1: Import Loader2 is already imported. Add ChevronDown for the button.**

At the top imports (line 6), add `ChevronDown` to the lucide-react import:

```typescript
import {
  X,
  Loader2,
  Users,
  Star,
  Target,
  Crown,
  TrendingUp,
  BarChart3,
  Sparkles,
  Coins,
  AlertCircle,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
```

- [ ] **Step 2: Create a shared ShowMoreButton component**

Add after the `StatCard` component (after line 116):

```typescript
function ShowMoreButton({
  onClick,
  loading,
}: {
  onClick: () => void
  loading: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="flex items-center justify-center gap-1.5 w-full py-1.5 mt-1 rounded text-xs transition-colors hover:bg-white/5 disabled:opacity-50"
      style={{ color: 'var(--text-muted)' }}
    >
      {loading ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <ChevronDown size={12} />
      )}
      {loading ? 'Loading…' : 'Show more'}
    </button>
  )
}
```

- [ ] **Step 3: Destructure loadMore functions from useYourStats**

Update the hook call in `YourStatsPanel` (around line 538):

```typescript
  const { stats, loading, sessionError, refetch, loadMoreSubs, loadMoreVIPs, loadMorePolls, loadMorePredictions } = useYourStats(
    broadcasterId,
    isStreamer,
    fetchOptions,
  )
```

- [ ] **Step 4: Add Show more to SubscriberBody**

In the `SubscriberBody` component, update the JSX to accept the section for cursor/loadingMore. Change the StatCard for Subscribers (around line 698-705) to pass cursor info:

Replace the Subscribers StatCard block:
```typescript
                <StatCard
                  title="Subscribers"
                  icon={<Star size={14} />}
                  section={stats.subscribers}
                  emptyMessage="No active subscribers"
                >
                  {(data) => (
                    <>
                      <SubscriberBody data={data} />
                      {stats.subscribers.cursor && (
                        <ShowMoreButton onClick={loadMoreSubs} loading={stats.subscribers.loadingMore} />
                      )}
                    </>
                  )}
                </StatCard>
```

- [ ] **Step 5: Add Show more to VIPs card**

Replace the VIPs StatCard block (around line 707-714):
```typescript
                <StatCard
                  title="VIPs"
                  icon={<Crown size={14} />}
                  section={stats.vips}
                  emptyMessage="No VIPs yet"
                >
                  {(vips) => (
                    <>
                      <VIPsBody vips={vips} />
                      {stats.vips.cursor && (
                        <ShowMoreButton onClick={loadMoreVIPs} loading={stats.vips.loadingMore} />
                      )}
                    </>
                  )}
                </StatCard>
```

- [ ] **Step 6: Add Show more to Polls card**

Replace the Polls StatCard block (around line 725-732):
```typescript
                <StatCard
                  title="Latest Poll"
                  icon={<BarChart3 size={14} />}
                  section={stats.polls}
                  emptyMessage="No recent polls"
                >
                  {(polls) => (
                    <>
                      <PollsBody polls={polls} />
                      {stats.polls.cursor && (
                        <ShowMoreButton onClick={loadMorePolls} loading={stats.polls.loadingMore} />
                      )}
                    </>
                  )}
                </StatCard>
```

- [ ] **Step 7: Add Show more to Predictions card**

Replace the Predictions StatCard block (around line 734-743):
```typescript
                <StatCard
                  title="Latest Prediction"
                  icon={<Sparkles size={14} />}
                  section={stats.predictions}
                  emptyMessage="No recent predictions"
                >
                  {(predictions) => (
                    <>
                      <PredictionsBody predictions={predictions} />
                      {stats.predictions.cursor && (
                        <ShowMoreButton onClick={loadMorePredictions} loading={stats.predictions.loadingMore} />
                      )}
                    </>
                  )}
                </StatCard>
```

- [ ] **Step 8: Update VIPsBody to show all VIPs when expanded**

The `VIPsBody` currently hardcodes `slice(0, 8)` and shows "+N more". After load-more appends data, it should show all loaded items. Replace VIPsBody (lines 249-287):

```typescript
function VIPsBody({ vips }: { vips: VIPsBodyData }) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-2xl font-bold"
        style={{
          color: 'var(--accent-green)',
          fontFamily: 'var(--font-heading)',
        }}
      >
        {vips.length}
      </p>
      {vips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {vips.slice(0).map((v, i) => (
            <span
              key={`${v.user_name}-${i}`}
              className="text-[11px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: 'var(--bg-card-hover)',
                color: 'var(--text-secondary)',
              }}
            >
              {v.user_name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

Note: `slice(0)` is identity — all loaded VIPs render. The "Show more" button handles progressive loading.

- [ ] **Step 9: Update PollsBody to show all loaded polls**

Currently it only renders `polls[0]`. After load-more, it should render all:

Replace PollsBody (lines 338-401):

```typescript
function PollsBody({ polls }: { polls: TwitchPoll[] }) {
  if (polls.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No recent polls
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {polls.map((poll) => {
        const totalVotes = poll.choices.reduce((sum, c) => sum + c.votes, 0)
        const sortedChoices = [...poll.choices].sort((a, b) => b.votes - a.votes)
        return (
          <div key={poll.id} className="flex flex-col gap-2">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
              title={poll.title}
            >
              {poll.title}
            </p>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {poll.status} · {totalVotes.toLocaleString()} votes
            </span>
            <div className="flex flex-col gap-1.5">
              {sortedChoices.slice(0, 4).map((choice) => {
                const pct =
                  totalVotes > 0
                    ? Math.round((choice.votes / totalVotes) * 100)
                    : 0
                return (
                  <div key={choice.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs truncate"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {choice.title}
                      </span>
                      <span
                        className="text-xs shrink-0 ml-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <div
                      className="w-full h-1 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-card-hover)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: 'var(--accent-green)',
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 10: Update PredictionsBody to show all loaded predictions**

Replace PredictionsBody (lines 403-474):

```typescript
function PredictionsBody({ predictions }: { predictions: TwitchPrediction[] }) {
  if (predictions.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No recent predictions
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {predictions.map((prediction) => {
        const totalPoints = prediction.outcomes.reduce(
          (sum, o) => sum + o.channel_points,
          0,
        )
        return (
          <div key={prediction.id} className="flex flex-col gap-2">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
              title={prediction.title}
            >
              {prediction.title}
            </p>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {prediction.status} · {totalPoints.toLocaleString()} pts staked
            </span>
            <div className="flex flex-col gap-1.5">
              {prediction.outcomes.slice(0, 2).map((outcome) => {
                const pct =
                  totalPoints > 0
                    ? Math.round((outcome.channel_points / totalPoints) * 100)
                    : 0
                const isWinner = outcome.id === prediction.winning_outcome_id
                const color =
                  outcome.color === 'PINK' ? '#ff6bcb' : 'var(--accent-hls)'
                return (
                  <div key={outcome.id} className="flex flex-col gap-0.5">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-xs truncate"
                        style={{
                          color: isWinner
                            ? 'var(--accent-green)'
                            : 'var(--text-secondary)',
                          fontWeight: isWinner ? 700 : 400,
                        }}
                      >
                        {outcome.title}
                        {isWinner && ' ✓'}
                      </span>
                      <span
                        className="text-xs shrink-0 ml-2"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {outcome.users.toLocaleString()} picks
                      </span>
                    </div>
                    <div
                      className="w-full h-1 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--bg-card-hover)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 11: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/components/layout/YourStatsPanel.tsx
git commit -m "feat(stats): add Show more buttons to subs/VIPs/polls/predictions cards"
```

---

## Task 5: Refactor Following sort — live-first partitioning + asc/desc

**Files:**
- Modify: `src/contexts/AppContext.tsx` (sort type + reducer)
- Modify: `src/hooks/useFollowedChannels.ts` (sortFollows function)
- Modify: `src/components/layout/FollowingPanel.tsx` (sort UI)
- Modify: `src/contexts/__tests__/AppContext.test.tsx` (test updates)

- [ ] **Step 1: Update sort type and storage format in AppContext.tsx**

Replace the `FollowingSort` type and `loadFollowingSort` function (lines 22-33):

```typescript
export type FollowingSortMode = 'live-first' | 'alpha' | 'viewers'
export type FollowingSortDir = 'asc' | 'desc'
export interface FollowingSort {
  mode: FollowingSortMode
  dir: FollowingSortDir
}

const SORT_DEFAULTS: Record<FollowingSortMode, FollowingSortDir> = {
  'live-first': 'desc',
  alpha: 'asc',
  viewers: 'desc',
}

const FOLLOWING_SORT_STORAGE_KEY = 'prism_following_sort'

function loadFollowingSort(): FollowingSort {
  if (typeof localStorage === 'undefined') return { mode: 'live-first', dir: 'desc' }
  const stored = localStorage.getItem(FOLLOWING_SORT_STORAGE_KEY)
  if (!stored) return { mode: 'live-first', dir: 'desc' }
  // Handle legacy bare values from before asc/desc toggle
  if (stored === 'live-first' || stored === 'alpha' || stored === 'viewers') {
    return { mode: stored, dir: SORT_DEFAULTS[stored] }
  }
  // New format: "mode:dir"
  const [mode, dir] = stored.split(':')
  if (
    (mode === 'live-first' || mode === 'alpha' || mode === 'viewers') &&
    (dir === 'asc' || dir === 'desc')
  ) {
    return { mode, dir }
  }
  return { mode: 'live-first', dir: 'desc' }
}
```

- [ ] **Step 2: Update AppState to use the new FollowingSort type**

The `navPanel.followingSort` field (line 64) already references `FollowingSort`, so after the type change it will automatically use the new interface shape.

- [ ] **Step 3: Update the Action type for SET_FOLLOWING_SORT**

Change line 108:
```typescript
  | { type: 'SET_FOLLOWING_SORT'; sort: FollowingSort }
```

This already matches — the type is still `FollowingSort`, just the shape changed from string to object.

- [ ] **Step 4: Update the SET_FOLLOWING_SORT reducer case**

Replace lines 276-283:
```typescript
    case 'SET_FOLLOWING_SORT':
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(FOLLOWING_SORT_STORAGE_KEY, `${action.sort.mode}:${action.sort.dir}`)
      }
      return {
        ...state,
        navPanel: { ...state.navPanel, followingSort: action.sort },
      }
```

- [ ] **Step 5: Refactor sortFollows in useFollowedChannels.ts**

Replace the `sortFollows` function (lines 91-122) and update the import:

```typescript
import type { FollowingSort } from '../contexts/AppContext'

// ... existing code ...

export function sortFollows(
  follows: EnrichedFollow[],
  sort: FollowingSort,
): EnrichedFollow[] {
  const copy = [...follows]
  const dir = sort.dir === 'asc' ? 1 : -1

  const byName = (a: EnrichedFollow, b: EnrichedFollow) =>
    a.broadcaster_name.localeCompare(b.broadcaster_name, undefined, {
      sensitivity: 'base',
    })

  // Partition: live always above offline
  const partition = (a: EnrichedFollow, b: EnrichedFollow): number | null => {
    if (a.isLive && !b.isLive) return -1
    if (!a.isLive && b.isLive) return 1
    return null
  }

  return copy.sort((a, b) => {
    const p = partition(a, b)
    if (p !== null) return p

    switch (sort.mode) {
      case 'alpha':
        return dir * byName(a, b)
      case 'viewers': {
        const bothLive = a.isLive && b.isLive
        if (bothLive) {
          return dir * ((a.viewerCount ?? 0) - (b.viewerCount ?? 0))
        }
        // Both offline — sort by name in the same direction
        return dir * byName(a, b)
      }
      case 'live-first':
      default: {
        const bothLive = a.isLive && b.isLive
        if (bothLive) {
          return dir * ((a.viewerCount ?? 0) - (b.viewerCount ?? 0))
        }
        return byName(a, b)
      }
    }
  })
}
```

Note on `dir` multiplier: For "desc" (dir = -1), `dir * (a - b)` becomes `b - a` (highest first). For "asc" (dir = 1), it stays `a - b` (lowest first). For alphabetical with `dir = -1`, it reverses locale comparison (Z→A).

- [ ] **Step 6: Update FollowingPanel sort UI**

Replace the sort chips section and related code in `FollowingPanel.tsx`. First update imports:

```typescript
import type { FollowingSort, FollowingSortMode } from '../../contexts/AppContext'
```

Replace `SORT_OPTIONS` (lines 13-17):
```typescript
const SORT_OPTIONS: { id: FollowingSortMode; label: string }[] = [
  { id: 'live-first', label: 'Live first' },
  { id: 'alpha', label: 'Alphabetical' },
  { id: 'viewers', label: 'Most viewers' },
]
```

Update the `setSort` callback (lines 50-55):
```typescript
  const setSort = useCallback(
    (mode: FollowingSortMode) => {
      const defaults: Record<FollowingSortMode, 'asc' | 'desc'> = {
        'live-first': 'desc',
        alpha: 'asc',
        viewers: 'desc',
      }
      dispatch({ type: 'SET_FOLLOWING_SORT', sort: { mode, dir: defaults[mode] } })
    },
    [dispatch],
  )

  const toggleDir = useCallback(() => {
    dispatch({
      type: 'SET_FOLLOWING_SORT',
      sort: { mode: sort.mode, dir: sort.dir === 'asc' ? 'desc' : 'asc' },
    })
  }, [dispatch, sort])
```

Replace the sort chips JSX (lines 111-143):
```typescript
      {data.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span
            className="text-xs uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Sort:
          </span>
          {SORT_OPTIONS.map((opt) => {
            const active = sort.mode === opt.id
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setSort(opt.id)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-all"
                style={{
                  backgroundColor: active
                    ? 'rgba(57, 255, 20, 0.15)'
                    : 'var(--bg-card)',
                  border: `1px solid ${active ? 'var(--accent-green)' : 'var(--border)'}`,
                  color: active
                    ? 'var(--accent-green)'
                    : 'var(--text-secondary)',
                }}
                aria-pressed={active}
              >
                {opt.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={toggleDir}
            className="px-2 py-1 rounded-full text-xs font-bold transition-all"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
            aria-label={sort.dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
            title={sort.dir === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sort.dir === 'asc' ? '▲' : '▼'}
          </button>
        </div>
      )}
```

- [ ] **Step 7: Update AppContext tests**

In `src/contexts/__tests__/AppContext.test.tsx`, update the SET_FOLLOWING_SORT test (around lines 401-417):

```typescript
    it('SET_FOLLOWING_SORT updates the sort and persists to localStorage', () => {
      const { result } = renderHook(() => useApp(), { wrapper })
      expect(result.current.state.navPanel.followingSort).toEqual({ mode: 'live-first', dir: 'desc' })

      act(() => {
        result.current.dispatch({ type: 'SET_FOLLOWING_SORT', sort: { mode: 'viewers', dir: 'desc' } })
      })
      expect(result.current.state.navPanel.followingSort).toEqual({ mode: 'viewers', dir: 'desc' })
      expect(localStorage.getItem('prism_following_sort')).toBe('viewers:desc')

      act(() => {
        result.current.dispatch({ type: 'SET_FOLLOWING_SORT', sort: { mode: 'alpha', dir: 'asc' } })
      })
      expect(result.current.state.navPanel.followingSort).toEqual({ mode: 'alpha', dir: 'asc' })
      expect(localStorage.getItem('prism_following_sort')).toBe('alpha:asc')
    })
```

- [ ] **Step 8: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/contexts/AppContext.tsx src/hooks/useFollowedChannels.ts src/components/layout/FollowingPanel.tsx src/contexts/__tests__/AppContext.test.tsx
git commit -m "feat(following): live-first sort partitioning + asc/desc toggle"
```

---

## Task 6: Following panel — load more beyond 400

**Files:**
- Modify: `src/hooks/useFollowedChannels.ts`
- Modify: `src/components/layout/FollowingPanel.tsx`

- [ ] **Step 1: Refactor useFollowedChannels for load-more**

Replace the hook (keeping `enrichFollows` and `sortFollows` unchanged). Key changes:
- Replace `MAX_FOLLOWS` with `INITIAL_PAGES = 4`
- Store cursor after initial loop
- Add `loadMore()` function
- Expose `loadedCount`, `loadingMore`, `cursor`, `loadMore`

Replace the constants and hook (lines 16-226):

```typescript
const INITIAL_PAGES = 4
const PAGE_SIZE = 100

// ... EnrichedFollow interface stays the same (lines 24-35) ...
// ... enrichFollows function stays the same (lines 53-85) ...
// ... sortFollows function stays the same (already updated in Task 5) ...

interface UseFollowedChannelsOptions {
  handleAuthError?: () => void
}

interface UseFollowedChannelsReturn {
  data: EnrichedFollow[]
  totalCount: number
  loadedCount: number
  liveCount: number
  loading: boolean
  loadingMore: boolean
  error: string | null
  cursor: string | null
  refetch: () => void
  loadMore: () => Promise<void>
}

export function useFollowedChannels(
  userId: string | null,
  options?: UseFollowedChannelsOptions,
): UseFollowedChannelsReturn {
  const [rawFollows, setRawFollows] = useState<EnrichedFollow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)

  const fetchData = useCallback(
    async (uid: string) => {
      setLoading(true)
      setError(null)
      try {
        const allFollows: TwitchFollowedChannel[] = []
        let pageCursor: string | null = null
        let pages = 0
        do {
          const page = await getFollowedChannelsPage(
            uid,
            PAGE_SIZE,
            pageCursor ?? undefined,
          )
          allFollows.push(...page.data)
          pageCursor = page.cursor
          pages++
        } while (pageCursor && pages < INITIAL_PAGES)

        setTotalCount(allFollows.length)
        setCursor(pageCursor)

        const liveStreams: TwitchStream[] = []
        if (allFollows.length > 0) {
          const chunks: string[][] = []
          for (let i = 0; i < allFollows.length; i += PAGE_SIZE) {
            chunks.push(
              allFollows
                .slice(i, i + PAGE_SIZE)
                .map((f) => f.broadcaster_id),
            )
          }
          const chunkResults = await Promise.all(
            chunks.map((ids) => getStreamsByUserIds(ids)),
          )
          for (const streams of chunkResults) {
            liveStreams.push(...streams)
          }
        }

        setRawFollows(enrichFollows(allFollows, liveStreams))
        setLoading(false)
      } catch (err) {
        if (err instanceof SessionExpiredError) {
          options?.handleAuthError?.()
          setError(err.message)
        } else {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load followed channels',
          )
        }
        setLoading(false)
      }
    },
    [options],
  )

  useEffect(() => {
    if (!userId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing state on userId transition to null (logout / panel close)
      setRawFollows([])
      setTotalCount(0)
      setCursor(null)
      return
    }
    fetchData(userId)
  }, [userId, fetchData])

  const loadMore = useCallback(async () => {
    if (!userId || !cursor) return
    setLoadingMore(true)
    try {
      const page = await getFollowedChannelsPage(userId, PAGE_SIZE, cursor)
      setCursor(page.cursor)

      // Enrich the new page with live status
      const newIds = page.data.map((f) => f.broadcaster_id)
      const newStreams = newIds.length > 0 ? await getStreamsByUserIds(newIds) : []
      const enriched = enrichFollows(page.data, newStreams)

      setRawFollows((prev) => [...prev, ...enriched])
      setTotalCount((prev) => prev + page.data.length)
      setLoadingMore(false)
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        options?.handleAuthError?.()
      }
      setLoadingMore(false)
    }
  }, [userId, cursor, options])

  const liveCount = useMemo(
    () => rawFollows.filter((f) => f.isLive).length,
    [rawFollows],
  )

  const refetch = useCallback(() => {
    if (userId) fetchData(userId)
  }, [userId, fetchData])

  return {
    data: rawFollows,
    totalCount,
    loadedCount: rawFollows.length,
    liveCount,
    loading,
    loadingMore,
    error,
    cursor,
    refetch,
    loadMore,
  }
}
```

- [ ] **Step 2: Update FollowingPanel to show Load More + count**

Destructure the new fields from the hook (around line 39):
```typescript
  const { data, totalCount, loadedCount, liveCount, loading, loadingMore, error, cursor, loadMore } = useFollowedChannels(
    fetchUserId,
    fetchOptions,
  )
```

Update the count display (around lines 68-90). Replace:
```typescript
          {totalCount > 0 && (
            <p
              className="text-sm mt-1"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                {totalCount}
              </span>{' '}
              channels
              {cursor && (
                <span style={{ color: 'var(--text-muted)' }}> (showing {loadedCount})</span>
              )}
              {' · '}
              <span
                style={{
                  color:
                    liveCount > 0
                      ? 'var(--accent-green)'
                      : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {liveCount} live now
              </span>
            </p>
          )}
```

Add a "Load more" button after the grid (replace lines 208-217):
```typescript
      {!loading && !error && sortedData.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-2">
            {sortedData.map((follow) => (
              <FollowedChannelCard
                key={follow.broadcaster_id}
                follow={follow}
              />
            ))}
          </div>
          {cursor && (
            <div className="flex justify-center pb-4">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors hover:bg-white/5 disabled:opacity-50"
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                }}
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent-green)' }} />
                ) : null}
                {loadingMore ? 'Loading…' : 'Load more channels'}
              </button>
            </div>
          )}
        </>
      )}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFollowedChannels.ts src/components/layout/FollowingPanel.tsx
git commit -m "feat(following): load more beyond 400 follows with live-state enrichment"
```

---

## Task 7: Write sortFollows test for live-first partitioning + asc/desc

**Files:**
- Create: `src/hooks/__tests__/useFollowedChannels.test.ts`

- [ ] **Step 1: Write sorting tests**

```typescript
import { describe, it, expect } from 'vitest'
import { sortFollows } from '../useFollowedChannels'
import type { EnrichedFollow } from '../useFollowedChannels'

function makeFollow(name: string, isLive: boolean, viewers?: number): EnrichedFollow {
  return {
    broadcaster_id: name,
    broadcaster_login: name.toLowerCase(),
    broadcaster_name: name,
    followed_at: '2024-01-01T00:00:00Z',
    isLive,
    viewerCount: viewers,
  }
}

describe('sortFollows', () => {
  const alice = makeFollow('Alice', true, 500)
  const bob = makeFollow('Bob', true, 100)
  const charlie = makeFollow('Charlie', false)
  const dave = makeFollow('Dave', false)
  const all = [charlie, alice, dave, bob]

  describe('live-first partitioning', () => {
    it('alpha:asc puts live A-Z above offline A-Z', () => {
      const sorted = sortFollows(all, { mode: 'alpha', dir: 'asc' })
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'Alice', 'Bob', 'Charlie', 'Dave',
      ])
    })

    it('alpha:desc puts live Z-A above offline Z-A', () => {
      const sorted = sortFollows(all, { mode: 'alpha', dir: 'desc' })
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'Bob', 'Alice', 'Dave', 'Charlie',
      ])
    })

    it('viewers:desc puts highest viewers first within live group', () => {
      const sorted = sortFollows(all, { mode: 'viewers', dir: 'desc' })
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'Alice', 'Bob', 'Charlie', 'Dave',
      ])
    })

    it('viewers:asc puts lowest viewers first within live group', () => {
      const sorted = sortFollows(all, { mode: 'viewers', dir: 'asc' })
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'Bob', 'Alice', 'Charlie', 'Dave',
      ])
    })

    it('live-first:desc sorts live by viewers desc', () => {
      const sorted = sortFollows(all, { mode: 'live-first', dir: 'desc' })
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'Alice', 'Bob', 'Charlie', 'Dave',
      ])
    })

    it('live-first:asc sorts live by viewers asc', () => {
      const sorted = sortFollows(all, { mode: 'live-first', dir: 'asc' })
      expect(sorted.map((f) => f.broadcaster_name)).toEqual([
        'Bob', 'Alice', 'Charlie', 'Dave',
      ])
    })
  })

  it('handles all-offline list without error', () => {
    const offlineOnly = [charlie, dave]
    const sorted = sortFollows(offlineOnly, { mode: 'viewers', dir: 'desc' })
    expect(sorted.map((f) => f.broadcaster_name)).toEqual(['Charlie', 'Dave'])
  })

  it('handles all-live list without error', () => {
    const liveOnly = [bob, alice]
    const sorted = sortFollows(liveOnly, { mode: 'alpha', dir: 'asc' })
    expect(sorted.map((f) => f.broadcaster_name)).toEqual(['Alice', 'Bob'])
  })

  it('handles empty list', () => {
    expect(sortFollows([], { mode: 'alpha', dir: 'asc' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run src/hooks/__tests__/useFollowedChannels.test.ts`
Expected: All 9 tests pass.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (171+ original + 9 new).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/__tests__/useFollowedChannels.test.ts
git commit -m "test: add sortFollows tests for live-first partitioning + asc/desc"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run lint**

Run: `npx eslint .`
Expected: No new errors.

- [ ] **Step 2: Run type check**

Run: `npx tsc -b`
Expected: No type errors.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

- [ ] **Step 4: Run dev server**

Run: `npx vite --port 5000`
Verify:
- App loads without console errors
- If previously logged in, onboarding doesn't re-show (migration shim preserved the `prism_onboarding_seen` key)
- Search history survives the migration
- Following panel sort chips work with asc/desc toggle
- Sort always shows live channels above offline

- [ ] **Step 5: Commit any lint/type fixes if needed, then stop dev server**
