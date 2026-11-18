import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { getRecommended, setRecommended } from '../../../lib/recommendedStore'
import RecommendedRow from '../RecommendedRow'

const renderRow = () =>
  render(
    <MemoryRouter>
      <RecommendedRow />
    </MemoryRouter>,
  )

beforeEach(() => localStorage.clear())

describe('RecommendedRow', () => {
  it('shows nothing until channels were imported', () => {
    const { container } = renderRow()
    expect(container).toBeEmptyDOMElement()
  })

  it('links each recommended channel to its PRISM page, with the import date', () => {
    setRecommended(['ogre_jpg', 'zedxyr'], Date.UTC(2026, 10, 18, 12))
    renderRow()
    expect(screen.getByRole('link', { name: 'ogre_jpg' })).toHaveAttribute('href', '/twitch/ogre_jpg')
    expect(screen.getByRole('link', { name: 'zedxyr' })).toHaveAttribute('href', '/twitch/zedxyr')
    expect(screen.getByText(/imported/i)).toBeInTheDocument()
  })

  it('forgets the list on Clear', () => {
    setRecommended(['ogre_jpg'])
    const { container } = renderRow()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(getRecommended()).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })
})
