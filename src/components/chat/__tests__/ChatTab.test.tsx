import { render, screen } from '@testing-library/react'
import ChatTab from '../ChatTab'
import type { DockSide } from '../chatPlacement'

const renderTab = (side: DockSide = 'right') =>
  render(<ChatTab side={side} label="Show chat" onClick={() => {}} />)

const tab = () => screen.getByRole('button', { name: 'Show chat' })

// Measured contrast against the page (#050507): the icon was 2.69:1 and the border
// 1.18:1, so the strip was close to invisible. These classes put the icon at 12:1
// on a lighter fill with a 5.9:1 border.
describe('ChatTab', () => {
  it('draws its icon in the primary text colour, with no faint inline colour left over', () => {
    renderTab()
    expect(tab()).toHaveClass('text-[color:var(--text-primary)]')
    expect(tab().style.color).toBe('')
  })

  it('has a visible fill and border instead of the near-invisible card colours', () => {
    renderTab()
    expect(tab()).toHaveClass('bg-[var(--border-accent)]', 'border', 'border-[color:var(--text-secondary)]')
    expect(tab().style.backgroundColor).toBe('')
    expect(tab().style.border).toBe('')
  })

  it('lights up in the accent colour on hover and on keyboard focus', () => {
    renderTab()
    expect(tab()).toHaveClass(
      'hover:border-[color:var(--accent-green)]',
      'hover:text-[color:var(--accent-green)]',
      'focus-visible:border-[color:var(--accent-green)]',
    )
  })

  it('keeps its fill on hover instead of fading it', () => {
    renderTab()
    expect(tab()).not.toHaveClass('hover:bg-white/5')
  })

  it('stays on its own side of the player and keeps its label', () => {
    renderTab('left')
    expect(tab()).toHaveAttribute('data-side', 'left')
    expect(tab()).toHaveClass('md:mr-2')
    expect(tab()).toHaveAttribute('title', 'Show chat')
  })
})
