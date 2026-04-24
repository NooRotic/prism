import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProtocolCard } from '../ProtocolCard'

describe('ProtocolCard', () => {
  it('renders protocol label and count', () => {
    render(
      <MemoryRouter>
        <ProtocolCard protocol="twitch" count={6} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Twitch')).toBeInTheDocument()
    expect(screen.getByText('6 demo sources')).toBeInTheDocument()
  })

  it('uses singular for count of 1', () => {
    render(
      <MemoryRouter>
        <ProtocolCard protocol="youtube" count={1} />
      </MemoryRouter>,
    )
    expect(screen.getByText('1 demo source')).toBeInTheDocument()
  })

  it('renders description', () => {
    render(
      <MemoryRouter>
        <ProtocolCard protocol="hls-dash" count={5} />
      </MemoryRouter>,
    )
    expect(screen.getByText('Adaptive streaming protocols')).toBeInTheDocument()
  })

  it('links to the correct route', () => {
    render(
      <MemoryRouter>
        <ProtocolCard protocol="twitch" count={3} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/twitch')
  })
})
