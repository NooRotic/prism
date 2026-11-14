import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePageHit } from '../usePageHit'

const flags = vi.hoisted(() => ({ send: true }))
vi.mock('../../config/historyServer', () => ({
  HISTORY_ENABLED: true,
  HISTORY_API_URL: 'https://history.test',
  get SEND_VISITS() {
    return flags.send
  },
}))

// The test's way to move the router: the harness hands over its `navigate` once it has mounted.
const router: { go: (to: string) => void } = { go: () => {} }

function Harness() {
  usePageHit()
  const navigate = useNavigate()
  useEffect(() => {
    router.go = (to) => void navigate(to)
  }, [navigate])
  return null
}

let fetchMock: ReturnType<typeof vi.fn>

const sections = () => fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).section)

function mountAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  )
}

const visit = (to: string) => act(() => router.go(to))

describe('usePageHit', () => {
  beforeEach(() => {
    flags.send = true
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('counts the page the visitor lands on, once', () => {
    mountAt('/')

    expect(sections()).toEqual(['home'])
  })

  it('counts every move to a different path, including channel to channel and back', () => {
    mountAt('/twitch/a')
    visit('/twitch/b')
    visit('/twitch/a')

    expect(sections()).toEqual(['twitch', 'twitch', 'twitch'])
  })

  it('counts each section a visitor moves through', () => {
    mountAt('/')
    visit('/twitch')
    visit('/hls-dash/custom')
    visit('/nope')

    expect(sections()).toEqual(['home', 'twitch', 'hls-dash', 'other'])
  })

  it('does not count a change of query or hash on the same path', () => {
    mountAt('/hls-dash/custom')
    visit('/hls-dash/custom?url=https%3A%2F%2Fexample.test%2Fa.m3u8')
    visit('/hls-dash/custom?url=https%3A%2F%2Fexample.test%2Fb.m3u8#player')

    expect(sections()).toEqual(['hls-dash'])
  })

  it('does not count a trailing slash as a new page', () => {
    mountAt('/twitch')
    visit('/twitch/')

    expect(sections()).toEqual(['twitch'])
  })

  it('never counts the admin pages, and counts the first page after leaving them', () => {
    mountAt('/admin')
    visit('/admin/security')
    visit('/admin/usage')
    expect(sections()).toEqual([])

    visit('/twitch/a')
    expect(sections()).toEqual(['twitch'])
  })

  it('sends nothing outside a production build', () => {
    flags.send = false

    mountAt('/')
    visit('/twitch/a')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
