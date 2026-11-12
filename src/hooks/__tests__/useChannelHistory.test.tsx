import { renderHook, waitFor } from '@testing-library/react'
import { resetVisitMemory, useChannelHistory } from '../useChannelHistory'
import { loadChannelHistory, type ChannelHistory, type HistoryResult } from '../../lib/historyApi'

const flags = vi.hoisted(() => ({ sendVisits: true }))
vi.mock('../../config/historyServer', () => ({
  get SEND_VISITS() {
    return flags.sendVisits
  },
}))
vi.mock('../../lib/historyApi', () => ({ loadChannelHistory: vi.fn() }))

const mockLoad = vi.mocked(loadChannelHistory)

const THIRTY_MINUTES = 30 * 60 * 1000
const T0 = Date.UTC(2026, 10, 12, 12, 0, 0)

const DATA: ChannelHistory = {
  login: 'alice',
  displayName: 'Alice',
  avatarUrl: null,
  broadcasterType: 'partner',
  language: 'en',
  category: null,
  trackedSince: '2026-11-12',
  lastUpdated: null,
  ttStatus: 'none',
  bioLinks: [],
  latest: null,
  history: [],
}

const tracked = (data: ChannelHistory = DATA): HistoryResult => ({ kind: 'tracked', data })

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('useChannelHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetVisitMemory()
    flags.sendVisits = true
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(T0)
    mockLoad.mockResolvedValue(tracked())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is idle without a login and makes no request', () => {
    const { result } = renderHook(() => useChannelHistory(undefined))

    expect(result.current).toEqual({ status: 'idle' })
    expect(mockLoad).not.toHaveBeenCalled()
  })

  it('is loading first, then ready with the data', async () => {
    const { result } = renderHook(() => useChannelHistory('alice'))

    expect(result.current).toEqual({ status: 'loading' })
    await waitFor(() => expect(result.current).toEqual({ status: 'ready', data: DATA }))
  })

  it('maps untracked and unavailable results to their states', async () => {
    mockLoad.mockResolvedValueOnce({ kind: 'untracked' })
    const first = renderHook(() => useChannelHistory('someone'))
    await waitFor(() => expect(first.result.current).toEqual({ status: 'untracked' }))

    mockLoad.mockResolvedValueOnce({ kind: 'unavailable' })
    const second = renderHook(() => useChannelHistory('another'))
    await waitFor(() => expect(second.result.current).toEqual({ status: 'unavailable' }))
  })

  it('ignores a stale answer after the login changed', async () => {
    const slow = deferred<HistoryResult>()
    const fast = deferred<HistoryResult>()
    mockLoad.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)
    const { result, rerender } = renderHook(({ login }) => useChannelHistory(login), { initialProps: { login: 'alice' } })

    rerender({ login: 'bob' })
    slow.resolve(tracked({ ...DATA, login: 'alice' }))
    await Promise.resolve()

    expect(result.current).toEqual({ status: 'loading' })

    fast.resolve(tracked({ ...DATA, login: 'bob' }))
    await waitFor(() => expect(result.current).toMatchObject({ status: 'ready', data: { login: 'bob' } }))
  })

  it('goes back to loading when the login changes and reads the new channel', async () => {
    const { result, rerender } = renderHook(({ login }) => useChannelHistory(login), { initialProps: { login: 'alice' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    mockLoad.mockReturnValueOnce(new Promise(() => {}))
    rerender({ login: 'bob' })

    expect(result.current).toEqual({ status: 'loading' })
    expect(mockLoad).toHaveBeenLastCalledWith('bob', expect.objectContaining({ sendVisit: true }))
  })

  it('sends a visit on the first mount when visits are on, with a lower-cased login', async () => {
    const { result } = renderHook(() => useChannelHistory('Alice'))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockLoad).toHaveBeenCalledTimes(1)
    expect(mockLoad).toHaveBeenCalledWith('alice', { sendVisit: true, signal: expect.any(AbortSignal) })
  })

  it('does a plain read instead of a second visit when it mounts again within 30 minutes', async () => {
    const first = renderHook(() => useChannelHistory('alice'))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    vi.setSystemTime(T0 + THIRTY_MINUTES - 1)
    const second = renderHook(() => useChannelHistory('alice'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))

    expect(mockLoad.mock.calls.map((call) => call[1].sendVisit)).toEqual([true, false])
  })

  it('treats the same channel in another letter case as the same channel', async () => {
    const first = renderHook(() => useChannelHistory('Alice'))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))

    const second = renderHook(() => useChannelHistory('aLiCe'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))

    expect(mockLoad.mock.calls.map((call) => call[1].sendVisit)).toEqual([true, false])
  })

  it('visits again after 30 minutes', async () => {
    const first = renderHook(() => useChannelHistory('alice'))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    vi.setSystemTime(T0 + THIRTY_MINUTES)
    const second = renderHook(() => useChannelHistory('alice'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))

    expect(mockLoad.mock.calls.map((call) => call[1].sendVisit)).toEqual([true, true])
  })

  it('gives every channel its own visit', async () => {
    const { result, rerender } = renderHook(({ login }) => useChannelHistory(login), { initialProps: { login: 'alice' } })
    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ login: 'bob' })
    await waitFor(() => expect(mockLoad).toHaveBeenCalledTimes(2))

    expect(mockLoad.mock.calls.map((call) => call[1].sendVisit)).toEqual([true, true])
  })

  it('never sends a visit when this build does not send visits', async () => {
    flags.sendVisits = false
    const { result } = renderHook(() => useChannelHistory('alice'))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(mockLoad).toHaveBeenCalledWith('alice', { sendVisit: false, signal: expect.any(AbortSignal) })
  })

  it('forgets what it has visited when asked, for tests', async () => {
    const first = renderHook(() => useChannelHistory('alice'))
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    resetVisitMemory()
    const second = renderHook(() => useChannelHistory('alice'))
    await waitFor(() => expect(second.result.current.status).toBe('ready'))

    expect(mockLoad.mock.calls.map((call) => call[1].sendVisit)).toEqual([true, true])
  })

  it('aborts the request when it unmounts and does not update after that', async () => {
    const pending = deferred<HistoryResult>()
    mockLoad.mockReturnValueOnce(pending.promise)
    const { unmount } = renderHook(() => useChannelHistory('alice'))
    const signal = mockLoad.mock.calls[0][1].signal as AbortSignal

    unmount()
    pending.resolve(tracked())
    await Promise.resolve()

    expect(signal.aborted).toBe(true)
  })
})
