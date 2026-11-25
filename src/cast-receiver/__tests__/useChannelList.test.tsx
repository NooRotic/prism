import { act, renderHook } from '@testing-library/react'
import { loadStreamSnapshot, refreshStreamSnapshot, type SnapshotResult, type StreamSnapshot } from '../../lib/streamsApi'
import { useChannelList } from '../useChannelList'

vi.mock('../../lib/streamsApi', async (original) => ({ ...(await original<object>()), loadStreamSnapshot: vi.fn(), refreshStreamSnapshot: vi.fn() }))

const load = vi.mocked(loadStreamSnapshot)
const refresh = vi.mocked(refreshStreamSnapshot)
const snapshot = (id: string): StreamSnapshot => ({ generated: id, defaultId: null, groups: [], streams: [{ id, name: id, groups: [], country: null, logo: null, kind: 'hls', pinned: false, state: 'working', url: 'https://h.test/a.m3u8' }] })
const ready = (id: string): SnapshotResult => ({ kind: 'ready', snapshot: snapshot(id) })
const settle = () => act(async () => {})
const MINUTE = 60_000

beforeEach(() => {
  vi.useFakeTimers()
  load.mockReset().mockResolvedValue(ready('one'))
  refresh.mockReset().mockResolvedValue(ready('two'))
})
afterEach(() => {
  vi.useRealTimers()
})

it('loads the list when the page opens', async () => {
  const { result } = renderHook(() => useChannelList())
  expect(result.current.list).toBeNull()
  await settle()
  expect(result.current.list?.generated).toBe('one')
})

it('asks again only when the list is over 30 minutes old', async () => {
  const { result } = renderHook(() => useChannelList())
  await settle()
  vi.advanceTimersByTime(30 * MINUTE - 1)
  act(() => result.current.refreshIfOld())
  expect(refresh).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  act(() => result.current.refreshIfOld())
  act(() => result.current.refreshIfOld()) // one at a time
  expect(refresh).toHaveBeenCalledTimes(1)
  await settle()
  expect(result.current.list?.generated).toBe('two')
  act(() => result.current.refreshIfOld())
  expect(refresh).toHaveBeenCalledTimes(1)
})

it.each<[string, SnapshotResult]>([
  ['missing', { kind: 'unavailable' }],
  ['empty', { kind: 'ready', snapshot: { generated: '', defaultId: null, groups: [], streams: [] } }],
])('asks again at once when the list is %s', async (_what, first) => {
  load.mockResolvedValue(first)
  const { result } = renderHook(() => useChannelList())
  await settle()
  act(() => result.current.refreshIfOld())
  await settle()
  expect(result.current.list?.generated).toBe('two')
})

it('keeps the list it has when the new one is empty', async () => {
  const { result } = renderHook(() => useChannelList())
  await settle()
  refresh.mockResolvedValue({ kind: 'ready', snapshot: { generated: 'none', defaultId: null, groups: [], streams: [] } })
  vi.advanceTimersByTime(31 * MINUTE)
  act(() => result.current.refreshIfOld())
  await settle()
  expect(result.current.list?.generated).toBe('one')
})

it('keeps the list it has when asking again gives nothing, and can ask once more', async () => {
  const { result } = renderHook(() => useChannelList())
  await settle()
  refresh.mockResolvedValue({ kind: 'unavailable' })
  vi.advanceTimersByTime(31 * MINUTE)
  act(() => result.current.refreshIfOld())
  await settle()
  expect(result.current.list?.generated).toBe('one')
  act(() => result.current.refreshIfOld())
  expect(refresh).toHaveBeenCalledTimes(2)
})
