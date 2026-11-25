import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
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

function DebugState() {
  const { state } = useApp()
  return <div data-testid="debug-state">{state.player.debugMode ? 'on' : 'off'}</div>
}

function renderHeader(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <Header />
        <DebugState />
      </AppProvider>
    </MemoryRouter>,
  )
}

// The debug gear is in the bar from 640 px up (below that it is in the Accounts row).
function wideScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(min-width: 640px)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

const accounts = () => screen.getByRole('button', { name: /^Accounts:/ })

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

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders "PRISM" title', () => {
    renderHeader()
    expect(screen.getByText('PRISM')).toBeInTheDocument()
  })

  it('has no Twitch-only connect or logout button in the bar any more: sign-in lives in Accounts', () => {
    renderHeader()
    expect(screen.queryByText('connect twitch')).not.toBeInTheDocument()
    expect(screen.queryByText('logout')).not.toBeInTheDocument()
    expect(accounts()).toBeInTheDocument()
  })

  it('calls login() from Connect in the Accounts row', async () => {
    const loginFn = vi.fn()
    mockedUseTwitchAuth.mockReturnValue({ isAuthenticated: false, login: loginFn, logout: vi.fn(), token: null, handleAuthError: vi.fn() })

    renderHeader()
    const user = userEvent.setup()
    await user.click(accounts())
    const twitch = within(document.getElementById('header-row') as HTMLElement).getByRole('region', { name: 'Twitch' })
    await user.click(within(twitch).getByRole('button', { name: 'Connect' }))
    expect(loginFn).toHaveBeenCalledOnce()
  })

  it('calls logout() from Sign out in the Accounts row', async () => {
    const logoutFn = vi.fn()
    mockedUseTwitchAuth.mockReturnValue({ isAuthenticated: true, login: vi.fn(), logout: logoutFn, token: 'test-token', handleAuthError: vi.fn() })

    renderHeader()
    const user = userEvent.setup()
    await user.click(accounts())
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(logoutFn).toHaveBeenCalledOnce()
  })

  // The toggle lives in the header, not over the player: anything drawn on
  // top of the Twitch embed makes Twitch's visibility check fail and disables
  // autoplay (verified 2026-11-04: hiding the in-player gear flipped it).
  it('has a debug toggle that switches debug mode', async () => {
    wideScreen()
    renderHeader('/twitch/streamer')
    expect(screen.getByTestId('debug-state')).toHaveTextContent('off')
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Toggle debug overlay'))
    expect(screen.getByTestId('debug-state')).toHaveTextContent('on')
  })

  // Fill mode hides the page chrome with CSS (display: none), never by unmounting,
  // so auth and the rest of the header keep their state.
  it('is marked fill-hide so fill mode can hide it', () => {
    renderHeader()
    expect(screen.getByRole('banner')).toHaveClass('fill-hide')
  })
})
