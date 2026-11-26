import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { linkName, startLinkTracking, trackEvent, trackPage } from '../analytics'

afterEach(() => {
  delete window._paq
})

/** Counting is on, as the block in index.html leaves it. */
function counting(): unknown[][] {
  const queue: unknown[][] = []
  window._paq = queue
  return queue
}

describe('where counting is off (localhost, Do Not Track, Global Privacy Control)', () => {
  it('does nothing', () => {
    trackPage({ path: '/', title: 'Home' })
    trackEvent('Twitch', 'opened', 'shroud')
    const stop = startLinkTracking()
    stop()
    expect(window._paq).toBeUndefined()
  })
})

it('never throws when the tracker does', () => {
  window._paq = {
    push: () => {
      throw new Error('boom')
    },
  }
  expect(() => trackEvent('Twitch', 'opened', 'shroud')).not.toThrow()
  expect(() => trackPage({ path: '/', title: 'Home' })).not.toThrow()
  const stop = startLinkTracking()
  document.body.innerHTML = '<a href="https://kick.com/x" target="_blank">x</a>'
  expect(() => document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).not.toThrow()
  document.body.innerHTML = ''
  stop()
})

describe('trackPage', () => {
  it('sends a page view with the given address only', () => {
    const queue = counting()
    trackPage({ path: '/hls-dash/custom', title: 'HLS / DASH: pasted address', query: '?utm_source=x', referrer: '' })
    expect(queue).toEqual([
      ['setReferrerUrl', ''],
      ['setCustomUrl', `${window.location.origin}/hls-dash/custom?utm_source=x`],
      ['setDocumentTitle', 'HLS / DASH: pasted address'],
      ['trackPageView'],
    ])
  })

  it('leaves the referrer alone when none is given', () => {
    const queue = counting()
    trackPage({ path: '/', title: 'Home' })
    expect(queue.map(([name]) => name)).toEqual(['setCustomUrl', 'setDocumentTitle', 'trackPageView'])
  })
})

it('trackEvent sends an event with and without a name', () => {
  const queue = counting()
  trackEvent('Twitch', 'opened', 'shroud')
  trackEvent('Feature', 'chat pop-out')
  expect(queue).toEqual([
    ['trackEvent', 'Twitch', 'opened', 'shroud'],
    ['trackEvent', 'Feature', 'chat pop-out'],
  ])
})

describe('startLinkTracking: links to other sites, by site only', () => {
  let stop = () => {}

  beforeEach(() => {
    window.history.pushState(null, '', '/')
    // jsdom cannot follow a link: nothing here may try.
    document.body.addEventListener('click', (event) => event.preventDefault())
  })
  afterEach(() => {
    stop()
    document.body.innerHTML = ''
    window.history.pushState(null, '', '/')
  })

  function clickOn(html: string, type = 'click', button = 0): unknown[][] {
    const queue = counting()
    stop()
    stop = startLinkTracking()
    document.body.innerHTML = html
    const target = document.querySelector('[data-target]') ?? document.querySelector('a')!
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button }))
    return queue
  }

  it.each([
    ['typed words (the category panel)', 'https://www.twitch.tv/directory/category/my private typed words', 'https://www.twitch.tv/'],
    ['a pasted address (a video page with no video id)', 'https://www.youtube.com/watch?v=https://www.youtube.com/watch?list=PLprivate', 'https://www.youtube.com/'],
    ['a fragment', 'https://kick.com/name#private', 'https://kick.com/'],
    ['a name and password in the address', 'https://private:private@host.test/x', 'https://host.test/'],
    ['something Matomo would call a download', 'https://host.test/private.mp4?private', 'https://host.test/'],
  ])('sends the site and never the rest of the address: %s', (_name, href, site) => {
    const queue = clickOn(`<a href="${href}">x</a>`)

    expect(queue).toEqual([['trackLink', site, 'link']])
    expect(JSON.stringify(queue)).not.toContain('private')
  })

  it('finds the link around what was clicked, and counts a middle click', () => {
    expect(clickOn('<a href="https://kick.com/x"><svg data-target></svg></a>')).toHaveLength(1)
    expect(clickOn('<a href="https://kick.com/x">x</a>', 'auxclick', 1)).toHaveLength(1)
  })

  it.each([
    ["PRISM's own pages", '<a href="/hls-dash/custom?url=https://x.test/private.mp4">x</a>'],
    ['a place on the page', '<a href="#top">x</a>'],
    ['a mail address', '<a href="mailto:private@x.test">x</a>'],
    ['a link marked to be left out', '<a class="matomo_ignore" href="https://x.test/private.m3u8">x</a>'],
    ['a link inside something marked to be left out', '<div class="matomo_ignore"><a href="https://x.test/private.m3u8">x</a></div>'],
    ['something that is no link', '<button data-target>x</button>'],
  ])('sends nothing for %s', (_name, html) => {
    expect(clickOn(html)).toEqual([])
  })

  it('sends nothing for a right click', () => {
    expect(clickOn('<a href="https://kick.com/x">x</a>', 'auxclick', 2)).toEqual([])
  })

  it.each(['/admin/playlist', '/popout/player?kind=stream&url=https%3A%2F%2Fx.test%2Fprivate'])('sends nothing on %s, also once counting has started elsewhere', (path) => {
    window.history.pushState(null, '', path)

    expect(clickOn('<a href="https://kick.com/x">x</a>')).toEqual([])
  })

  it('never turns on the tracker\'s own link tracking, which sends whole addresses', () => {
    const queue = counting()
    stop = startLinkTracking()

    expect(queue).toEqual([])
  })

  it('stops', () => {
    const queue = counting()
    startLinkTracking()()
    document.body.innerHTML = '<a href="https://kick.com/x">x</a>'
    document.querySelector('a')!.click()

    expect(queue).toEqual([])
  })
})

describe('linkName', () => {
  it.each([
    [{ twitch: 'x', youtube: { title: 'Y' } }, 'twitch/x <-> youtube/Y'],
    [{ twitch: 'x', kick: { slug: 'k' } }, 'twitch/x <-> kick/k'],
    [{ twitch: 'x', youtube: { title: 'Y' }, kick: { slug: 'k' } }, 'twitch/x <-> youtube/Y + kick/k'],
  ])('names the pair %j', (link, name) => {
    expect(linkName(link)).toBe(name)
  })
})
