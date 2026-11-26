import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePageView } from '../usePageView'
import { startLinkTracking, trackPage } from '../../lib/analytics'

vi.mock('../../lib/analytics', () => ({ trackPage: vi.fn(), startLinkTracking: vi.fn() }))

const KEY = 'prism_entry_referrer'
const ORIGIN = window.location.origin

// The test's way to move the router: the harness hands over its `navigate` once it has mounted.
const router: { go: (to: string) => void } = { go: () => {} }

function Harness() {
  usePageView()
  const navigate = useNavigate()
  useEffect(() => {
    router.go = (to) => void navigate(to)
  }, [navigate])
  return null
}

const mountAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  )
const visit = (to: string) => act(() => router.go(to))
const views = () => vi.mocked(trackPage).mock.calls.map(([view]) => view)

let browserReferrer = ''

beforeEach(() => {
  vi.mocked(trackPage).mockClear()
  vi.mocked(startLinkTracking).mockClear()
  sessionStorage.clear()
  browserReferrer = ''
  vi.spyOn(document, 'referrer', 'get').mockImplementation(() => browserReferrer)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('usePageView', () => {
  it('counts the page landed on, then every move to a different path', () => {
    mountAt('/')
    visit('/twitch/a')
    visit('/twitch/b')

    expect(views().map(({ path, title }) => [path, title])).toEqual([
      ['/', 'Home'],
      ['/twitch/a', 'Twitch channel'],
      ['/twitch/b', 'Twitch channel'],
    ])
  })

  it('does not count a changed query or fragment, or a trailing slash', () => {
    mountAt('/hls-dash/custom')
    visit('/hls-dash/custom?url=https%3A%2F%2Fexample.test%2Fa.m3u8')
    visit('/hls-dash/custom?url=https%3A%2F%2Fexample.test%2Fb.m3u8#player')
    visit('/hls-dash/custom/')

    expect(views()).toHaveLength(1)
  })

  it('never hands over a query or a fragment', () => {
    mountAt('/hls-dash/custom?url=https%3A%2F%2Fx.test%2Fsecret.m3u8#access_token=secret')

    expect(views()).toHaveLength(1)
    expect(JSON.stringify(views())).not.toContain('secret')
  })

  it('sends campaign tags with the first view only', () => {
    mountAt('/?utm_source=linkedin&x=1')
    visit('/twitch?utm_source=again')

    expect(views().map(({ query }) => query || '')).toEqual(['?utm_source=linkedin', ''])
  })

  it('sends the referrer kept by the 404 redirect, once, and forgets it', () => {
    sessionStorage.setItem(KEY, 'https://www.linkedin.com/')
    browserReferrer = `${ORIGIN}/twitch/a`
    mountAt('/twitch/a')

    expect(views()[0].referrer).toBe('https://www.linkedin.com/')
    expect(sessionStorage.getItem(KEY)).toBeNull()
  })

  it('sends an empty referrer when the browser says PRISM sent it: that address can hold a pasted stream', () => {
    browserReferrer = `${ORIGIN}/hls-dash/custom?url=https%3A%2F%2Fx.test%2Fsecret.m3u8`
    mountAt('/hls-dash/custom?url=https%3A%2F%2Fx.test%2Fsecret.m3u8')

    expect(views()[0].referrer).toBe('')
  })

  it("leaves another site's referrer to Matomo", () => {
    browserReferrer = 'https://www.google.com/'
    mountAt('/')

    expect(views()[0].referrer).toBeUndefined()
  })

  it('names the page before as the referrer of later views, without its query', () => {
    mountAt('/hls-dash/custom?url=https%3A%2F%2Fx.test%2Fsecret.m3u8&utm_source=a')
    visit('/twitch/a')
    visit('/')

    expect(views().map(({ referrer }) => referrer).slice(1)).toEqual([`${ORIGIN}/hls-dash/custom`, `${ORIGIN}/twitch/a`])
  })

  it('sends nothing, and does not start link tracking, for a pop-out or admin page', () => {
    mountAt('/popout/player?kind=stream&url=https%3A%2F%2Fx.test%2Fa')
    visit('/admin/usage')
    visit('/chat/shroud')

    expect(views()).toEqual([])
    expect(startLinkTracking).not.toHaveBeenCalled()
  })

  it('keeps the first view for the first page that is counted', () => {
    sessionStorage.setItem(KEY, 'https://www.linkedin.com/')
    mountAt('/admin')
    visit('/twitch/a?utm_source=linkedin')

    expect(views()).toEqual([expect.objectContaining({ path: '/twitch/a', query: '?utm_source=linkedin', referrer: 'https://www.linkedin.com/' })])
  })

  it('starts link tracking once, after the first view', () => {
    mountAt('/')
    visit('/twitch')

    expect(startLinkTracking).toHaveBeenCalledTimes(1)
    expect(vi.mocked(trackPage).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(startLinkTracking).mock.invocationCallOrder[0])
  })

  it('still sends the first view when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    mountAt('/twitch/a')

    expect(views()).toHaveLength(1)
  })
})
