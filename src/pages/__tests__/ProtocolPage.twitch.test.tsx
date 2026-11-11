import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ProtocolPage from '../ProtocolPage'
import { useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'

vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../components/dashboard/TwitchDashboard', () => ({
  default: () => <div data-testid="twitch-dashboard" />,
}))
vi.mock('../../components/grid/DemoGrid', () => ({
  DemoGrid: () => <div data-testid="demo-grid" />,
}))
vi.mock('../../components/grid/YouTubeGrid', () => ({
  YouTubeGrid: () => <div data-testid="youtube-grid" />,
}))
vi.mock('../../components/search/SmartUrlInput', () => ({ SmartUrlInput: () => <div /> }))

const mockApp = vi.mocked(useApp)
const mockAuth = vi.mocked(useTwitchAuth)

function setAuth({ signedIn, expired = false }: { signedIn: boolean; expired?: boolean }) {
  mockAuth.mockReturnValue({
    token: signedIn ? 't' : null,
    isAuthenticated: signedIn,
    login: vi.fn(),
    logout: vi.fn(),
    handleAuthError: vi.fn(),
  })
  mockApp.mockReturnValue({
    state: { auth: { isAuthenticated: signedIn, expired, token: null, user: null, profileError: false } },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
}

function renderPage(protocol: 'twitch' | 'youtube' | 'hls-dash') {
  return render(
    <MemoryRouter>
      <ProtocolPage protocol={protocol} />
    </MemoryRouter>,
  )
}

describe('ProtocolPage on the Twitch protocol', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the connect card above the demo grid to a signed-out visitor, and no dashboard', () => {
    setAuth({ signedIn: false })
    renderPage('twitch')

    expect(screen.getByText('Connect Twitch to see who you follow that is live.')).toBeInTheDocument()
    expect(screen.getByTestId('demo-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('twitch-dashboard')).not.toBeInTheDocument()
  })

  it('says the sign-in expired when that is why the visitor is signed out', () => {
    setAuth({ signedIn: false, expired: true })
    renderPage('twitch')

    expect(
      screen.getByText('Your Twitch sign-in expired. Connect again to see who you follow that is live.'),
    ).toBeInTheDocument()
  })

  it('shows the dashboard instead of the demo grid to a signed-in viewer', () => {
    setAuth({ signedIn: true })
    renderPage('twitch')

    expect(screen.getByTestId('twitch-dashboard')).toBeInTheDocument()
    expect(screen.queryByTestId('demo-grid')).not.toBeInTheDocument()
    expect(screen.queryByText('Connect Twitch to see who you follow that is live.')).not.toBeInTheDocument()
  })

  it('leaves the YouTube page as it was, signed in or not', () => {
    setAuth({ signedIn: true })
    renderPage('youtube')

    expect(screen.getByTestId('youtube-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('twitch-dashboard')).not.toBeInTheDocument()
  })

  it('leaves the HLS / DASH page as it was, with no connect card', () => {
    setAuth({ signedIn: false })
    renderPage('hls-dash')

    expect(screen.getByTestId('demo-grid')).toBeInTheDocument()
    expect(screen.queryByText('Connect Twitch to see who you follow that is live.')).not.toBeInTheDocument()
    expect(screen.queryByTestId('twitch-dashboard')).not.toBeInTheDocument()
  })
})
