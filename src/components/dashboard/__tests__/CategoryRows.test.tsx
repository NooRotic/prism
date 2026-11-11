import { fireEvent, render, screen } from '@testing-library/react'
import CategoryRows from '../CategoryRows'
import type { CategoryRow } from '../../../lib/dashboardStats'

function rows(n: number): CategoryRow[] {
  return Array.from({ length: n }, (_, i) => ({ name: `Game ${i + 1}`, liveCount: n - i, viewers: 1000 * (n - i) }))
}

describe('CategoryRows', () => {
  it('shows six rows and a button for the rest', () => {
    render(<CategoryRows rows={rows(8)} onOpen={vi.fn()} />)

    expect(screen.getAllByRole('button', { name: /^Game \d+, / })).toHaveLength(6)
    expect(screen.getByRole('button', { name: '+ 2 more categories' })).toBeInTheDocument()
  })

  it('expands in place to every row', () => {
    render(<CategoryRows rows={rows(8)} onOpen={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '+ 2 more categories' }))

    expect(screen.getAllByRole('button', { name: /^Game \d+, / })).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /more categories/ })).not.toBeInTheDocument()
  })

  it('has no expander when there are six rows or fewer', () => {
    render(<CategoryRows rows={rows(6)} onOpen={vi.fn()} />)

    expect(screen.queryByRole('button', { name: /more categories/ })).not.toBeInTheDocument()
  })

  it('names each row with its live count and viewers, and opens it on click', () => {
    const onOpen = vi.fn()
    render(<CategoryRows rows={[{ name: 'Just Chatting', liveCount: 6, viewers: 2300 }]} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: 'Just Chatting, 6 live, 2.3k watching' }))

    expect(onOpen).toHaveBeenCalledWith('Just Chatting')
  })

  it('shows the No category row as plain text, not a button', () => {
    render(
      <CategoryRows
        rows={[
          { name: 'Valorant', liveCount: 2, viewers: 500 },
          { name: 'No category', liveCount: 1, viewers: 40 },
        ]}
        onOpen={vi.fn()}
      />,
    )

    expect(screen.getByText('No category')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /No category/ })).not.toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<CategoryRows rows={[]} onOpen={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })
})
