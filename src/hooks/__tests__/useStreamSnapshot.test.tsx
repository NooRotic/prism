import { renderHook, waitFor } from '@testing-library/react'
import { useStreamSnapshot } from '../useStreamSnapshot'
import { loadStreamSnapshot, resetSnapshotCache } from '../../lib/streamsApi'

const flags = vi.hoisted(() => ({ enabled: true }))
vi.mock('../../config/historyServer', () => ({
  get HISTORY_ENABLED() {
    return flags.enabled
  },
  HISTORY_API_URL: 'https://history.test',
  SEND_VISITS: false,
}))

// The real client, wrapped so one test can see (and hold open) the call the hook makes.
vi.mock('../../lib/streamsApi', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/streamsApi')>()
  return { ...actual, loadStreamSnapshot: vi.fn(actual.loadStreamSnapshot) }
})

const WIRE = {
  v: 1,
  generated: '2026-11-14T05:00:00Z',
  default: '0123456789ab',
  groups: ['Other'],
  streams: [{ i: '0123456789ab', n: 'Alpha', g: [0], c: 'us', l: null, k: 'hls', p: 1, s: 'working', u: 'https://a.test/live.m3u8' }],
}

function stubFetch(body: unknown, status = 200) {
  const mock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })))
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => {
  flags.enabled = true
  resetSnapshotCache()
  vi.mocked(loadStreamSnapshot).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useStreamSnapshot', () => {
  it('starts loading, then has the list', async () => {
    stubFetch(WIRE)

    const { result } = renderHook(() => useStreamSnapshot())
    expect(result.current).toEqual({ status: 'loading', snapshot: null })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.snapshot?.streams.map((s) => s.name)).toEqual(['Alpha'])
    expect(result.current.snapshot?.defaultId).toBe('0123456789ab')
  })

  it('loads once across two mounts, and the second mount is ready at once', async () => {
    const fetchMock = stubFetch(WIRE)
    const first = renderHook(() => useStreamSnapshot())
    await waitFor(() => expect(first.result.current.status).toBe('ready'))
    first.unmount()

    const second = renderHook(() => useStreamSnapshot())

    expect(second.result.current.status).toBe('ready')
    expect(second.result.current.snapshot?.streams).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('two mounts at the same time share the one request', async () => {
    const fetchMock = stubFetch(WIRE)

    const a = renderHook(() => useStreamSnapshot())
    const b = renderHook(() => useStreamSnapshot())

    await waitFor(() => expect(a.result.current.status).toBe('ready'))
    await waitFor(() => expect(b.result.current.status).toBe('ready'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is unavailable when the client says so (a 503, a bad answer), with no list', async () => {
    stubFetch({ error: 'not_ready' }, 503)

    const { result } = renderHook(() => useStreamSnapshot())

    await waitFor(() => expect(result.current.status).toBe('unavailable'))
    expect(result.current.snapshot).toBeNull()
  })

  it('is unavailable at once, with no request, when the server is switched off', () => {
    flags.enabled = false
    const fetchMock = stubFetch(WIRE)

    const { result } = renderHook(() => useStreamSnapshot())

    expect(result.current).toEqual({ status: 'unavailable', snapshot: null })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('gives up waiting when the page that asked is gone, and never updates it afterwards', async () => {
    let resolveLoad: (value: Awaited<ReturnType<typeof loadStreamSnapshot>>) => void = () => {}
    let seen: AbortSignal | undefined
    vi.mocked(loadStreamSnapshot).mockImplementationOnce((signal?: AbortSignal) => {
      seen = signal
      return new Promise((resolve) => {
        resolveLoad = resolve
      })
    })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result, unmount } = renderHook(() => useStreamSnapshot())
    expect(seen?.aborted).toBe(false)

    unmount()
    expect(seen?.aborted).toBe(true)

    resolveLoad({ kind: 'unavailable' })
    await Promise.resolve()
    expect(result.current.status).toBe('loading')
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })
})
