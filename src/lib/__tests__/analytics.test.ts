import { afterEach, describe, expect, it } from 'vitest'
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
    startLinkTracking()
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
  expect(() => startLinkTracking()).not.toThrow()
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

it('startLinkTracking turns Matomo link tracking on', () => {
  const queue = counting()
  startLinkTracking()
  expect(queue).toEqual([['enableLinkTracking']])
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
