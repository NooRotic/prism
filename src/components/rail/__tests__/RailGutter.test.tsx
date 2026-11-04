import { render, screen } from '@testing-library/react'
import RailGutter from '../RailGutter'

describe('RailGutter', () => {
  it('pads both edges by whatever the rail has reserved when active', () => {
    render(
      <RailGutter active>
        <p>page</p>
      </RailGutter>,
    )
    expect(screen.getByTestId('rail-gutter')).toHaveClass(
      'pl-(--rail-reserve-left)',
      'pr-(--rail-reserve-right)',
    )
  })

  it('adds no padding when inactive', () => {
    render(
      <RailGutter active={false}>
        <p>page</p>
      </RailGutter>,
    )
    const gutter = screen.getByTestId('rail-gutter')
    expect(gutter).not.toHaveClass('pl-(--rail-reserve-left)')
    expect(gutter).not.toHaveClass('pr-(--rail-reserve-right)')
  })

  it('renders its children either way', () => {
    const { rerender } = render(
      <RailGutter active>
        <p>page</p>
      </RailGutter>,
    )
    expect(screen.getByText('page')).toBeInTheDocument()

    rerender(
      <RailGutter active={false}>
        <p>page</p>
      </RailGutter>,
    )
    expect(screen.getByText('page')).toBeInTheDocument()
  })
})
