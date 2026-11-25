import { useEffect } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from '../App'
import { trackEvent } from '../lib/analytics'

// The whole app is mounted with one stand-in page that sends an event as it opens: index.html sends no page view of its own,
// so the one line in App that counts them is all of Matomo's page counting.
vi.mock('../AppRoutes', () => ({
  default: function StandInPage() {
    useEffect(() => trackEvent('Twitch', 'opened', 'shroud'), [])
    return null
  },
}))

beforeEach(() => {
  window.history.pushState(null, '', '/twitch/Shroud?url=https%3A%2F%2Fx.test%2Fsecret#access_token=secret')
})

afterEach(() => {
  cleanup()
  delete window._paq
  window.history.pushState(null, '', '/')
})

it('counts the page that was opened, before the events of that page, under its tidy address', () => {
  const queue: unknown[][] = []
  window._paq = queue
  render(<App />)

  expect(queue.filter(([name]) => name === 'trackPageView' || name === 'trackEvent')).toEqual([
    ['trackPageView'],
    ['trackEvent', 'Twitch', 'opened', 'shroud'],
  ])
  expect(queue).toContainEqual(['setCustomUrl', `${window.location.origin}/twitch/shroud`])
  expect(JSON.stringify(queue)).not.toContain('secret')
})
