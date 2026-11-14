import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import GroupPills from '../GroupPills'

function setup(selected: number | null = null) {
  const onSelect = vi.fn()
  render(<GroupPills groups={['Other', 'News', 'Empty']} counts={[10, 3, 0]} total={13} selected={selected} onSelect={onSelect} />)
  return onSelect
}

describe('GroupPills', () => {
  it('has a pill for all streams and one for each group that has streams, each with its count', () => {
    setup()

    expect(screen.getByRole('button', { name: 'All streams 13' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Other 10' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'News 3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Empty/ })).toBeNull()
  })

  it('marks the chosen pill as pressed, and tells the page which was pressed', async () => {
    const onSelect = setup(1)

    expect(screen.getByRole('button', { name: 'News 3' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Other 10' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Other 10' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'All streams 13' }))

    expect(onSelect).toHaveBeenNthCalledWith(1, 0)
    expect(onSelect).toHaveBeenNthCalledWith(2, null)
  })

  it('reads at 15 px, a size up from the 12 px it had, with room around the words', () => {
    setup()

    for (const pill of screen.getAllByRole('button')) {
      expect(pill.className).toContain('text-[0.95rem]')
      expect(pill.className).not.toContain('text-xs')
      expect(pill.className).toContain('px-4')
    }
  })

  it('draws a pill that is not chosen with the main text colour, a clear border and a lighter fill', () => {
    setup(1)

    const pill = screen.getByRole('button', { name: 'Other 10' })
    expect(pill.className).toContain('text-[var(--text-primary)]')
    expect(pill.className).toContain('border-[var(--text-muted)]')
    expect(pill.className).toContain('bg-[var(--bg-card-hover)]')
  })

  it('draws the chosen pill in solid blue with bold black text', () => {
    setup(1)

    const pill = screen.getByRole('button', { name: 'News 3' })
    expect(pill.className).toContain('bg-[var(--accent-hls)]')
    expect(pill.className).toContain('text-black')
    expect(pill.className).toContain('font-semibold')
  })
})
