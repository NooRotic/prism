import { describe, expect, it } from 'vitest'
import notFoundPage from '../../public/404.html?raw'
import { STORAGE_KEYS } from '../config/storageKeys'

// GitHub Pages answers a deep link with 404.html, which sends the browser on to index.html. That hop makes PRISM its own
// referrer, so the page keeps the real one for the first page view (usePageView). Run with stand-ins for what it uses.

function redirect({ referrer, blocked = false }: { referrer: string; blocked?: boolean }) {
  const script = /<script>([\s\S]*?)<\/script>/.exec(notFoundPage)?.[1]
  if (!script) throw new Error('no script in 404.html')
  const kept: Record<string, string> = {}
  let sentTo = ''
  const location = {
    protocol: 'https:',
    hostname: 'prism.nooroticx.tv',
    host: 'prism.nooroticx.tv',
    port: '',
    pathname: '/twitch/x',
    search: '?utm_source=a&utm_medium=b',
    hash: '',
    replace: (to: string) => {
      sentTo = to
    },
  }
  const storage = {
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error('blocked')
      kept[key] = value
    },
  }
  new Function('window', 'document', 'sessionStorage', script)({ location }, { referrer }, storage)
  return { kept, sentTo }
}

const TARGET = 'https://prism.nooroticx.tv/?/twitch/x&utm_source=a~and~utm_medium=b'

describe('404.html', () => {
  it("keeps another site's referrer, under the key the app reads", () => {
    expect(redirect({ referrer: 'https://www.linkedin.com/feed' }).kept).toEqual({
      [STORAGE_KEYS.SESSION_ENTRY_REFERRER]: 'https://www.linkedin.com/feed',
    })
  })

  it.each([
    ['PRISM itself', 'https://prism.nooroticx.tv/hls-dash/custom?url=secret'],
    ['nobody', ''],
    ['text that is no address', 'not an address'],
  ])('keeps nothing when the referrer is %s', (_name, referrer) => {
    expect(redirect({ referrer }).kept).toEqual({})
  })

  it.each([
    ['with storage', { referrer: 'https://www.linkedin.com/' }],
    ['with storage blocked', { referrer: 'https://www.linkedin.com/', blocked: true }],
    ['with a referrer it cannot read', { referrer: 'not an address' }],
  ])('sends the browser on to the same address, %s', (_name, visitor) => {
    expect(redirect(visitor).sentTo).toBe(TARGET)
  })
})
