// The small classic script that runs first on both prism-cast pages and decides, before anything else loads, whether this is a
// Cast device. Its own source is run here, as the extension's hand-off script is.
import deviceSource from '../../../cast/public/cast-device.js?raw'

interface CastDevice {
  isDevice(userAgent: string): boolean
  start(page: 'help' | 'tv', w: unknown): string
  RECEIVER: string
}

const mod = { exports: {} as CastDevice }
new Function('module', deviceSource)(mod)
const device = mod.exports

const GEN5 = 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 CrKey/1.56.500000 DeviceType/AndroidTV'
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const TV_BROWSER = 'Mozilla/5.0 (Linux; Android 12; Google TV Streamer) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

function fakeWindow(userAgent: string, search = '') {
  const doc = document.implementation.createHTMLDocument('page')
  return { navigator: { userAgent }, location: { search, replace: vi.fn() }, document: doc, prismCastReady: undefined as Promise<boolean> | undefined }
}

it('run as the page runs it, says what it decided, so the TV page can tell a device whose player failed from a browser', () => {
  const script = document.createElement('script')
  script.setAttribute('data-page', 'tv')
  Object.defineProperty(document, 'currentScript', { configurable: true, get: () => script })
  Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => GEN5 })
  try {
    new Function('module', deviceSource)({ exports: {} })
    const w = window as unknown as { prismCast?: { isDevice(ua: string): boolean; page: string } }
    expect(w.prismCast?.page).toBe('tv')
    expect(w.prismCast?.isDevice(GEN5)).toBe(true)
  } finally {
    Object.defineProperty(document, 'currentScript', { configurable: true, get: () => null })
    document.head.querySelectorAll('script[src*="cast_receiver"]').forEach((s) => s.remove())
  }
})

it('knows a Cast device by CrKey in its user agent', () => {
  expect(device.isDevice(GEN5)).toBe(true)
  expect(device.isDevice(DESKTOP)).toBe(false)
  expect(device.isDevice(TV_BROWSER)).toBe(false)
  expect(device.isDevice('')).toBe(false)
})

describe('the help page', () => {
  it('sends a Cast device to /tv/, keeping the query', () => {
    const w = fakeWindow(GEN5, '?x=1')
    expect(device.start('help', w)).toBe('forwarded')
    expect(w.location.replace).toHaveBeenCalledWith('/tv/?x=1')
  })

  it('stays for everyone else', () => {
    for (const ua of [DESKTOP, TV_BROWSER]) {
      const w = fakeWindow(ua)
      expect(device.start('help', w)).toBe('help')
      expect(w.location.replace).not.toHaveBeenCalled()
      expect(w.document.querySelector('script')).toBeNull()
    }
  })
})

describe('the TV page', () => {
  it('loads Google’s receiver script on a device, and says when it has', async () => {
    const w = fakeWindow(GEN5)
    expect(device.start('tv', w)).toBe('tv')
    const script = w.document.head.querySelector('script')
    expect(script?.getAttribute('src')).toBe(device.RECEIVER)
    script?.dispatchEvent(new Event('load'))
    await expect(w.prismCastReady).resolves.toBe(true)
  })

  it('says false when Google’s script does not load', async () => {
    const w = fakeWindow(GEN5)
    device.start('tv', w)
    w.document.head.querySelector('script')?.dispatchEvent(new Event('error'))
    await expect(w.prismCastReady).resolves.toBe(false)
  })

  it('loads it in any browser with ?tv, for testing on a computer', () => {
    const w = fakeWindow(DESKTOP, '?tv')
    expect(device.start('tv', w)).toBe('tv')
    expect(w.document.head.querySelector('script')).not.toBeNull()
  })

  it('in a browser (a computer, or a TV’s own) loads nothing and says false', async () => {
    for (const ua of [DESKTOP, TV_BROWSER]) {
      const w = fakeWindow(ua, '?dev')
      expect(device.start('tv', w)).toBe('browser')
      expect(w.document.querySelector('script')).toBeNull()
      await expect(w.prismCastReady).resolves.toBe(false)
    }
  })
})
