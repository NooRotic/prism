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
    expect(screen.getByRole('link', { name: /Import from YT/ })).toHaveAttribute('href', '/youtube/catchup')
  })

  it('does not offer it on the Twitch page', () => {
    render(
      <MemoryRouter>
        <ProtocolPage protocol="twitch" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link', { name: /Import from YT/ })).not.toBeInTheDocument()
  })

  it('keeps the Twitch-only Following and Your Stats links off the YouTube page', () => {
    render(
      <MemoryRouter>
        <ProtocolPage protocol="youtube" />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: 'Following' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Your Stats' })).not.toBeInTheDocument()
    expect(screen.queryByText('Connect Twitch')).not.toBeInTheDocument()
  })

  it('still shows them on the Twitch page', () => {
    render(
      <MemoryRouter>
        <ProtocolPage protocol="twitch" />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'Following' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Your Stats' })).toBeInTheDocument()
  })
})
