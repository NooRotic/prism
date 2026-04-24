import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FavoritesCard } from '../FavoritesCard'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'

vi.mock('../../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: vi.fn(() => ({
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    token: null,
    handleAuthError: vi.fn(),
  })),
}))

const mockedUseTwitchAuth = vi.mocked(useTwitchAuth)

describe('FavoritesCard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders lock and connect CTA when not authenticated', () => {
    render(<FavoritesCard />)
    expect(screen.getByText('Your Favorites')).toBeInTheDocument()
    expect(screen.getByText('Connect Twitch to see your followed channels')).toBeInTheDocument()
    expect(screen.getByText('connect twitch')).toBeInTheDocument()
  })

  it('calls login when connect button clicked', async () => {
    const loginFn = vi.fn()
    mockedUseTwitchAuth.mockReturnValue({
      isAuthenticated: false,
      login: loginFn,
      logout: vi.fn(),
      token: null,
      handleAuthError: vi.fn(),
    })

    render(<FavoritesCard />)
    const user = userEvent.setup()
    await user.click(screen.getByText('connect twitch'))
    expect(loginFn).toHaveBeenCalledOnce()
  })

  it('renders nothing when authenticated', () => {
    mockedUseTwitchAuth.mockReturnValue({
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      token: 'test-token',
      handleAuthError: vi.fn(),
    })

    const { container } = render(<FavoritesCard />)
    expect(container.innerHTML).toBe('')
  })
})
