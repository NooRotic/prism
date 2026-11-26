import { fetchTvSettings, parseTvSettings } from '../tvSettingsApi'

const flags = vi.hoisted(() => ({ enabled: true, url: 'https://history.test' }))
vi.mock('../../config/historyServer', () => ({
  get HISTORY_ENABLED() {
    return flags.enabled
  },
  get HISTORY_API_URL() {
    return flags.url
  },
  SEND_VISITS: false,
}))

function stubFetch(answer: () => Promise<Response>) {
  const mock = vi.fn(answer)
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
  flags.enabled = true
})

it('parses only { v: 1, qrStyle } with a known style', () => {
  expect(parseTvSettings({ v: 1, qrStyle: 'c' })).toEqual({ qrStyle: 'c' })
  for (const bad of [{ v: 2, qrStyle: 'c' }, { v: 1, qrStyle: 'z' }, { v: 1 }, null, [], 'c']) expect(parseTvSettings(bad)).toBeNull()
})

it('asks without trusting a cached copy', async () => {
  const mock = stubFetch(async () => new Response(JSON.stringify({ v: 1, qrStyle: 'a' })))
  expect(await fetchTvSettings()).toEqual({ qrStyle: 'a' })
  const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('https://history.test/api/tv')
  expect(init).toMatchObject({ cache: 'no-cache', credentials: 'omit' })
})

it('answers null on a network error, a 503 or bad JSON', async () => {
  stubFetch(async () => {
    throw new TypeError('offline')
  })
  expect(await fetchTvSettings()).toBeNull()
  stubFetch(async () => new Response('{"error":"not_ready"}', { status: 503 }))
  expect(await fetchTvSettings()).toBeNull()
  stubFetch(async () => new Response('not json'))
  expect(await fetchTvSettings()).toBeNull()
})

it('asks nothing while the server is switched off', async () => {
  flags.enabled = false
  const mock = stubFetch(async () => new Response('{}'))
  expect(await fetchTvSettings()).toBeNull()
  expect(mock).not.toHaveBeenCalled()
})
