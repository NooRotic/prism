import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotFoundPage from '../NotFoundPage'

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <NotFoundPage />
    </MemoryRouter>,
  )

describe('NotFoundPage', () => {
  it('says the page was not found', () => {
    renderAt('/nope')
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })

  it('shows the address that matched nothing, so a typo is easy to spot', () => {
    renderAt('/spike-pip.html')
    expect(screen.getByText('/spike-pip.html')).toBeInTheDocument()
  })

  it('offers a way home', () => {
    renderAt('/nope')
    expect(screen.getByRole('link', { name: 'Back to the PRISM home' })).toHaveAttribute('href', '/')
  })
})
