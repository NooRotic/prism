import { act, render } from '@testing-library/react'
import TvRing from '../TvRing'

/** jsdom has no ResizeObserver and no layout: both are stood in for. */
let observed: (() => void) | null = null
class FakeResizeObserver {
  constructor(callback: () => void) {
    observed = callback
  }
  observe() {}
  disconnect() {
    observed = null
  }
}

function sized(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, 'offsetWidth', { configurable: true, value: width })
  Object.defineProperty(element, 'offsetHeight', { configurable: true, value: height })
}

afterEach(() => {
  vi.unstubAllGlobals()
  observed = null
})

it('sizes its wheel to the panel again when the panel changes size', () => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  const { container } = render(
    <TvRing className="panel">
      <p>inside</p>
    </TvRing>,
  )
  const panel = container.querySelector('.panel') as HTMLElement
  const wheel = () => (container.querySelector('.tv-ring-wheel') as HTMLElement).style.width
  sized(panel, 300, 400)
  act(() => observed?.())
  expect(wheel()).toBe('500px')
  sized(panel, 600, 800)
  act(() => observed?.())
  expect(wheel()).toBe('1000px')
})

it('still works where ResizeObserver is missing', () => {
  vi.stubGlobal('ResizeObserver', undefined)
  expect(() =>
    render(
      <TvRing className="panel">
        <p>inside</p>
      </TvRing>,
    ),
  ).not.toThrow()
})
