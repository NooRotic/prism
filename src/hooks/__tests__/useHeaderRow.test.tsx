import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, MemoryRouter } from 'react-router-dom'
import { HOVER_CLOSE_DELAY_MS, HOVER_OPEN_DELAY_MS, useHeaderRow, type HeaderRowHolds } from '../useHeaderRow'

const NO_HOLDS: HeaderRowHolds = { navPanelOpen: false, browseOpen: false, importing: false }

function Harness({ holds }: { holds: HeaderRowHolds }) {
  const headerRef = useRef<HTMLElement | null>(null)
  const rowRef = useRef<HTMLDivElement | null>(null)
  const row = useHeaderRow(headerRef, rowRef, holds)
  return (
    <>
      <header ref={headerRef} data-testid="header">
        <button type="button" {...row.tabHoverProps('twitch')} onClick={(e) => row.press('twitch', e.currentTarget)}>
          Twitch tools
        </button>
        <button type="button" {...row.tabHoverProps('youtube')}>
          YouTube tools
        </button>
        <div ref={rowRef} {...row.rowHoverProps} data-testid="row">
          <button type="button">inside the row</button>
        </div>
      </header>
      <button type="button">outside</button>
      <Link to="/elsewhere">go elsewhere</Link>
      <output data-testid="state">{row.state.open ? `${row.state.open}:${row.state.pinned ? 'pinned' : 'previewed'}` : 'closed'}</output>
    </>
  )
}

function renderHarness(holds: HeaderRowHolds = NO_HOLDS) {
  const utils = render(
    <MemoryRouter initialEntries={['/twitch/foo']}>
      <Harness holds={holds} />
    </MemoryRouter>,
  )
  const rerenderWith = (next: HeaderRowHolds) =>
    utils.rerender(
      <MemoryRouter initialEntries={['/twitch/foo']}>
        <Harness holds={next} />
      </MemoryRouter>,
    )
  return { ...utils, rerenderWith }
}

const state = () => screen.getByTestId('state').textContent
const twitchTab = () => screen.getByRole('button', { name: 'Twitch tools' })
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useHeaderRow: hover', () => {
  it('opens a tab\'s row after 200 ms of mouse hover, not before', () => {
    renderHarness()
    fireEvent.pointerEnter(twitchTab(), { pointerType: 'mouse' })
    advance(HOVER_OPEN_DELAY_MS - 10)
    expect(state()).toBe('closed')
    advance(20)
    expect(state()).toBe('twitch:previewed')
  })

  it('ignores touch pointers', () => {
    renderHarness()
    fireEvent.pointerEnter(twitchTab(), { pointerType: 'touch' })
    advance(1000)
    expect(state()).toBe('closed')
  })

  it('does nothing for a pointer that only passes over the tab', () => {
    renderHarness()
    fireEvent.pointerEnter(twitchTab(), { pointerType: 'mouse' })
    advance(100)
    fireEvent.pointerLeave(twitchTab(), { pointerType: 'mouse' })
    advance(1000)
    expect(state()).toBe('closed')
  })

  it('keeps the row while the pointer moves from the tab into it, and folds 350 ms after leaving both', () => {
    renderHarness()
    fireEvent.pointerEnter(twitchTab(), { pointerType: 'mouse' })
    advance(HOVER_OPEN_DELAY_MS)
    fireEvent.pointerLeave(twitchTab(), { pointerType: 'mouse' })
    advance(100)
    fireEvent.pointerEnter(screen.getByTestId('row'), { pointerType: 'mouse' })
    advance(1000)
    expect(state()).toBe('twitch:previewed')

    fireEvent.pointerLeave(screen.getByTestId('row'), { pointerType: 'mouse' })
    advance(HOVER_CLOSE_DELAY_MS - 10)
    expect(state()).toBe('twitch:previewed')
    advance(20)
    expect(state()).toBe('closed')
  })
})

describe('useHeaderRow: press and Esc', () => {
  it('pins on press, and folds on Esc with focus back on the trigger', () => {
    renderHarness()
    fireEvent.click(twitchTab())
    expect(state()).toBe('twitch:pinned')
    screen.getByRole('button', { name: 'inside the row' }).focus()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(state()).toBe('closed')
    expect(document.activeElement).toBe(twitchTab())
  })

  it('pins a row that hover opened instead of folding it', () => {
    renderHarness()
    fireEvent.pointerEnter(twitchTab(), { pointerType: 'mouse' })
    advance(HOVER_OPEN_DELAY_MS)
    fireEvent.click(twitchTab())
    expect(state()).toBe('twitch:pinned')
    fireEvent.pointerLeave(twitchTab(), { pointerType: 'mouse' })
    advance(1000)
    expect(state()).toBe('twitch:pinned')
  })

  it('leaves Esc to an open panel', () => {
    const { rerenderWith } = renderHarness()
    fireEvent.click(twitchTab())
    rerenderWith({ ...NO_HOLDS, navPanelOpen: true })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(state()).toBe('twitch:pinned')
  })
})

describe('useHeaderRow: outside', () => {
  it('folds a pinned row on a pointerdown outside the header, not inside it', () => {
    renderHarness()
    fireEvent.click(twitchTab())
    fireEvent.pointerDown(screen.getByRole('button', { name: 'inside the row' }))
    expect(state()).toBe('twitch:pinned')

    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }))

    expect(state()).toBe('closed')
  })

  it('folds when the viewer clicks into a player', () => {
    renderHarness()
    fireEvent.click(twitchTab())
    const player = document.createElement('iframe')
    player.tabIndex = 0
    document.body.appendChild(player)
    player.focus()

    fireEvent.blur(window)
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(state()).toBe('closed')
    player.remove()
  })

  it('stays open through an outside click while importing', () => {
    const { rerenderWith } = renderHarness()
    fireEvent.click(twitchTab())
    rerenderWith({ ...NO_HOLDS, importing: true })

    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }))

    expect(state()).toBe('twitch:pinned')
  })

  // A mouse click leaves focus on the row button it hit; that is not the viewer working the row from the keyboard, and
  // the first click outside must still fold it (the browser moves focus only after pointerdown).
  it('folds on an outside click even though a clicked row button still has focus', () => {
    renderHarness()
    fireEvent.click(twitchTab())
    const inside = screen.getByRole('button', { name: 'inside the row' })
    fireEvent.pointerDown(inside)
    act(() => {
      inside.focus()
    })

    fireEvent.pointerDown(screen.getByRole('button', { name: 'outside' }))

    expect(state()).toBe('closed')
  })

  it('keeps a previewed row while the keyboard is working inside it', () => {
    renderHarness()
    fireEvent.pointerEnter(twitchTab(), { pointerType: 'mouse' })
    advance(HOVER_OPEN_DELAY_MS)
    fireEvent.keyDown(document, { key: 'Tab' })
    act(() => {
      screen.getByRole('button', { name: 'inside the row' }).focus()
    })

    fireEvent.pointerLeave(twitchTab(), { pointerType: 'mouse' })
    advance(1000)

    expect(state()).toBe('twitch:previewed')
  })
})

describe('useHeaderRow: Esc goes to the innermost thing first', () => {
  // In a real browser React flushes Browse's close between its own Esc handler and a document listener, so a
  // bubble-phase listener would see no hold and fold the row on the same key press. Here the inner handler closes
  // Browse synchronously (flushSync), which is what that in-between flush amounts to.
  function BrowseHarness({ initialBrowse }: { initialBrowse: boolean }) {
    const headerRef = useRef<HTMLElement | null>(null)
    const rowRef = useRef<HTMLDivElement | null>(null)
    const [browseOpen, setBrowseOpen] = useState(initialBrowse)
    const row = useHeaderRow(headerRef, rowRef, { ...NO_HOLDS, browseOpen })
    const searchRef = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
      const el = searchRef.current
      if (!el) return
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') flushSync(() => setBrowseOpen(false))
      }
      el.addEventListener('keydown', onKey)
      return () => el.removeEventListener('keydown', onKey)
    }, [])
    return (
      <>
        <header ref={headerRef}>
          <button type="button" onClick={(e) => row.press('twitch', e.currentTarget)}>
            Twitch tools
          </button>
          <div ref={rowRef}>
            <input ref={searchRef} aria-label="browse search" />
          </div>
          <div data-paste-box>
            <input aria-label="paste box" />
          </div>
        </header>
        <output data-testid="state">{row.state.open ? `${row.state.open}:${row.state.pinned ? 'pinned' : 'previewed'}` : 'closed'}</output>
      </>
    )
  }

  function renderBrowse(initialBrowse: boolean) {
    return render(
      <MemoryRouter>
        <BrowseHarness initialBrowse={initialBrowse} />
      </MemoryRouter>,
    )
  }

  it('lets one Esc close Browse and leaves the row open', () => {
    renderBrowse(true)
    fireEvent.click(twitchTab())

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'browse search' }), { key: 'Escape' })

    expect(state()).toBe('twitch:pinned')
  })

  it('leaves an Esc in the paste box to the paste box', () => {
    renderBrowse(false)
    fireEvent.click(twitchTab())

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'paste box' }), { key: 'Escape' })

    expect(state()).toBe('twitch:pinned')
  })
})

describe('useHeaderRow: page and visibility', () => {
  it('folds on a page change', () => {
    renderHarness()
    fireEvent.click(twitchTab())
    fireEvent.click(screen.getByRole('link', { name: 'go elsewhere' }))
    expect(state()).toBe('closed')
  })

  it('folds when the header is hidden (fill mode)', () => {
    let notify: () => void = () => {}
    class FakeObserver {
      constructor(cb: () => void) {
        notify = cb
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeObserver)
    renderHarness()
    fireEvent.click(twitchTab())
    Object.defineProperty(screen.getByTestId('header'), 'offsetHeight', { configurable: true, value: 0 })

    act(() => notify())

    expect(state()).toBe('closed')
  })
})
