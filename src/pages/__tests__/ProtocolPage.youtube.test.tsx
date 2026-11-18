import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProtocolPage from '../ProtocolPage'
import { useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'

vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../components/grid/DemoGrid', () => ({ DemoGrid: () => <div /> }))
vi.mock('../../components/grid/YouTubeGrid', () => ({ YouTubeGrid: () => <div /> }))
vi.mock('../../components/search/SmartUrlInput', () => ({ SmartUrlInput: () => <div /> }))

beforeEach(() => {
  vi.mocked(useTwitchAuth).mockReturnValue({ token: null, isAuthenticated: false, login: vi.fn(), logout: vi.fn(), handleAuthError: vi.fn() })
  vi.mocked(useApp).mockReturnValue({
    state: { auth: { isAuthenticated: false, expired: false, token: null, user: null, profileError: false } },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
})

describe('ProtocolPage on the YouTube protocol', () => {
  it('offers the Catch up page', () => {
    render(
      <MemoryRouter>
        <ProtocolPage protocol="youtube" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Catch up/ })).toHaveAttribute('href', '/youtube/catchup')
  })

  it('does not offer it on the Twitch page', () => {
    render(
      <MemoryRouter>
        <ProtocolPage protocol="twitch" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /Catch up/ })).not.toBeInTheDocument()
  })
})
