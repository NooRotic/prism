import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SlidedownPanel from '../SlidedownPanel'
import { AppProvider, useApp } from '../../../contexts/AppContext'

// A closed panel is parked just above the viewport with translateY(-100%).
// That alone leaves it rendered and composited on every page, which stops
// Twitch's embed from autoplaying (verified in Chrome, 2026-11-03: hiding the
// three closed panels with visibility:hidden restored autoplay).

function Opener() {
  const { dispatch } = useApp()
  return (
    <button onClick={() => dispatch({ type: 'OPEN_NAV_PANEL', panel: 'following' })}>
      open
    </button>
  )
}

function renderPanel() {
  render(
    <AppProvider>
      <Opener />
      <SlidedownPanel panelId="following" ariaLabel="Following">
        <div>panel content</div>
      </SlidedownPanel>
    </AppProvider>,
  )
  return screen.getByLabelText('Following')
}

describe('SlidedownPanel', () => {
  it('is visibility:hidden while closed so it does not take part in rendering', () => {
    const panel = renderPanel()
    expect(panel).toHaveStyle({ visibility: 'hidden' })
  })

  it('is marked fill-hide so fill mode can hide it', () => {
    const panel = renderPanel()
    expect(panel).toHaveClass('fill-hide')
  })

  it('becomes visible when opened', () => {
    const panel = renderPanel()
    act(() => {
      screen.getByText('open').click()
    })
    expect(panel).toHaveStyle({ visibility: 'visible' })
  })

  // Any button that toggles the panel (the header's row, the Twitch page's sidebar) is marked data-nav-trigger, and a
  // mousedown on it must not close the panel first: its own click would then open it again.
  it('stays open for a mousedown on any data-nav-trigger, and closes for one elsewhere', async () => {
    const { findByTestId } = render(
      <AppProvider>
        <Opener />
        <div data-nav-trigger>
          <button data-testid="first-trigger">a</button>
        </div>
        <div data-nav-trigger>
          <button data-testid="second-trigger">b</button>
        </div>
        <button data-testid="elsewhere">c</button>
        <SlidedownPanel panelId="following" ariaLabel="Following2">
          <div>panel content</div>
        </SlidedownPanel>
      </AppProvider>,
    )
    const panel = screen.getByLabelText('Following2')
    act(() => {
      screen.getByText('open').click()
    })
    // The outside-click listener is attached on the next animation frame.
    await new Promise((r) => requestAnimationFrame(() => r(null)))

    fireEvent.mouseDown(await findByTestId('second-trigger'))
    expect(panel).toHaveStyle({ visibility: 'visible' })

    fireEvent.mouseDown(await findByTestId('elsewhere'))
    expect(panel).toHaveStyle({ visibility: 'hidden' })
  })
})
