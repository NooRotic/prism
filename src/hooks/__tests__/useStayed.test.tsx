import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStayed } from '../useStayed'
import { trackEvent } from '../../lib/analytics'

vi.mock('../../lib/analytics', () => ({ trackEvent: vi.fn() }))

const router: { go: (to: string) => void } = { go: () => {} }

function Page({ name, floating }: { name: string | null; floating: boolean }) {
  useStayed(name, floating)
  const navigate = useNavigate()
  useEffect(() => {
    router.go = (to) => void navigate(to)
  }, [navigate])
  return null
}

const tree = (name: string | null, floating = false) => (
  <MemoryRouter initialEntries={['/youtube/aaaaaaaaaaa']}>
    <Page name={name} floating={floating} />
  </MemoryRouter>
)
const seconds = (n: number) => act(() => void vi.advanceTimersByTime(n * 1000))
const events = () => vi.mocked(trackEvent).mock.calls

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(trackEvent).mockClear()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useStayed', () => {
  it('reports 1 min and 10 min, once each', () => {
    render(tree('shroud'))
    seconds(55)
    expect(events()).toEqual([])
    seconds(5)
    expect(events()).toEqual([['Stayed', '1 min', 'shroud']])
    seconds(540)
    expect(events()).toEqual([['Stayed', '1 min', 'shroud'], ['Stayed', '10 min', 'shroud']])
    seconds(3600)
    expect(events()).toHaveLength(2)
  })

  it('does not count time while the page is hidden', () => {
    render(tree('shroud'))
    seconds(30)
    visibility = 'hidden'
    seconds(300)
    expect(events()).toEqual([])

    visibility = 'visible'
    seconds(30)
    expect(events()).toEqual([['Stayed', '1 min', 'shroud']])
  })

  it('counts while hidden when the video is popped out', () => {
    const { rerender } = render(tree('shroud'))
    rerender(tree('shroud', true))
    visibility = 'hidden'
    seconds(60)
    expect(events()).toEqual([['Stayed', '1 min', 'shroud']])
  })

  it('keeps the time already spent when the video is popped out or brought back', () => {
    const { rerender } = render(tree('shroud'))
    seconds(40)
    rerender(tree('shroud', true))
    seconds(20)
    expect(events()).toEqual([['Stayed', '1 min', 'shroud']])
  })

  it('starts again for another name', () => {
    const { rerender } = render(tree('a'))
    seconds(50)
    rerender(tree('b'))
    seconds(50)
    expect(events()).toEqual([])
    seconds(10)
    expect(events()).toEqual([['Stayed', '1 min', 'b']])
  })

  it('starts again on another page, also under the same name (the next video of one channel)', () => {
    render(tree('A channel (UC)'))
    seconds(60)
    act(() => router.go('/youtube/bbbbbbbbbbb'))
    seconds(60)
    expect(events()).toEqual([['Stayed', '1 min', 'A channel (UC)'], ['Stayed', '1 min', 'A channel (UC)']])
  })

  it('counts nothing without a name, and nothing after the page goes away', () => {
    const { rerender, unmount } = render(tree(null))
    seconds(700)
    expect(events()).toEqual([])

    rerender(tree('shroud'))
    seconds(30)
    unmount()
    seconds(700)
    expect(events()).toEqual([])
  })
})
