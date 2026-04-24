import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider } from '../../contexts/AppContext'
import HubPage from '../HubPage'

vi.mock('../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: vi.fn(() => ({
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    token: null,
    handleAuthError: vi.fn(),
  })),
}))

vi.mock('../../components/search/SmartUrlInput', () => ({
  SmartUrlInput: () => <div data-testid="smart-url-input" />,
}))

function renderHub() {
  return render(
    <MemoryRouter>
      <AppProvider>
        <HubPage />
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('HubPage', () => {
  it('renders PRISM title', () => {
    renderHub()
    expect(screen.getByText('PRISM')).toBeInTheDocument()
  })

  it('renders all three protocol cards', () => {
    renderHub()
    // Protocol names appear in cards AND bottom hint text, so use getAllByText
    expect(screen.getAllByText('Twitch').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('YouTube').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('HLS / DASH')).toBeInTheDocument()
  })

  it('renders SmartUrlInput', () => {
    renderHub()
    expect(screen.getByTestId('smart-url-input')).toBeInTheDocument()
  })

  it('renders feature hints', () => {
    renderHub()
    expect(screen.getByText('Clips')).toBeInTheDocument()
    expect(screen.getByText('VODs')).toBeInTheDocument()
    expect(screen.getByText('Stats')).toBeInTheDocument()
  })

  it('renders protocol card links with correct hrefs', () => {
    renderHub()
    const links = screen.getAllByRole('link')
    const hrefs = links.map((l) => l.getAttribute('href'))
    expect(hrefs).toContain('/twitch')
    expect(hrefs).toContain('/youtube')
    expect(hrefs).toContain('/hls-dash')
  })

  it('renders FavoritesCard when not authenticated', () => {
    renderHub()
    expect(screen.getByText('Your Favorites')).toBeInTheDocument()
  })

  it('shows demo source counts', () => {
    renderHub()
    expect(screen.getByText('6 demo sources')).toBeInTheDocument() // twitch
  })
})
