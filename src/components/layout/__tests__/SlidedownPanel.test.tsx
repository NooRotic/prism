import { act, render, screen } from '@testing-library/react'
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
})
