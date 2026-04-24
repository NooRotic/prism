import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../../../contexts/AppContext'
import { Header } from '../Header'
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

vi.mock('../../search/SmartUrlInput', () => ({
  SmartUrlInput: () => <div data-testid="smart-url-input" />,
}))

const mockedUseTwitchAuth = vi.mocked(useTwitchAuth)

function renderHeader() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <Header />
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUseTwitchAuth.mockReturnValue({
      isAuthenticated: false,
      login: vi.fn(),
      logout: vi.fn(),
      token: null,
      handleAuthError: vi.fn(),
    })
  })

  it('renders "PRISM" title', () => {
    renderHeader()
    expect(screen.getByText('PRISM')).toBeInTheDocument()
  })

  it('shows "connect twitch" button when not authenticated', () => {
    renderHeader()
    expect(screen.getByText('connect twitch')).toBeInTheDocument()
    expect(screen.queryByText('logout')).not.toBeInTheDocument()
  })

  it('shows "logout" button when authenticated', () => {
    mockedUseTwitchAuth.mockReturnValue({
      isAuthenticated: true,
      login: vi.fn(),
      logout: vi.fn(),
      token: 'test-token',
      handleAuthError: vi.fn(),
    })

    renderHeader()
    expect(screen.getByText('logout')).toBeInTheDocument()
    expect(screen.queryByText('connect twitch')).not.toBeInTheDocument()
  })

  it('calls login() when connect button is clicked', async () => {
    const loginFn = vi.fn()
    mockedUseTwitchAuth.mockReturnValue({
      isAuthenticated: false,
      login: loginFn,
      logout: vi.fn(),
      token: null,
      handleAuthError: vi.fn(),
    })

    renderHeader()
    const user = userEvent.setup()
    await user.click(screen.getByText('connect twitch'))
    expect(loginFn).toHaveBeenCalledOnce()
  })

  it('calls logout() when logout button is clicked', async () => {
    const logoutFn = vi.fn()
    mockedUseTwitchAuth.mockReturnValue({
      isAuthenticated: true,
      login: vi.fn(),
      logout: logoutFn,
      token: 'test-token',
      handleAuthError: vi.fn(),
    })

    renderHeader()
    const user = userEvent.setup()
    await user.click(screen.getByText('logout'))
    expect(logoutFn).toHaveBeenCalledOnce()
  })
})
