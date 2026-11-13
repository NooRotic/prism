import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ProtocolPage from '../ProtocolPage'
import { buildStreamPath } from '../../lib/routes'
import { useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'

vi.mock('../../contexts/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../components/grid/DemoGrid', () => ({
  DemoGrid: () => <div data-testid="demo-grid" />,
}))
vi.mock('../../components/search/SmartUrlInput', () => ({ SmartUrlInput: () => <div /> }))

function LocationSpy() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function renderAt(entry: string) {
  vi.mocked(useTwitchAuth).mockReturnValue({
    token: null,
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    handleAuthError: vi.fn(),
  })
  vi.mocked(useApp).mockReturnValue({
    state: { auth: { isAuthenticated: false, expired: false, token: null, user: null, profileError: false } },
    dispatch: vi.fn(),
  } as unknown as ReturnType<typeof useApp>)
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="hls-dash" element={<ProtocolPage protocol="hls-dash" />} />
        <Route path="hls-dash/:streamId" element={<LocationSpy />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtocolPage on the HLS/DASH protocol', () => {
  it('sends an old /hls-dash?url= link on to the player page, keeping the address intact', () => {
    const address = 'https://h/p.m3u8?token=a=b&c=d%20e'
    renderAt(`/hls-dash?url=${encodeURIComponent(address)}`)

    expect(screen.getByTestId('location')).toHaveTextContent(buildStreamPath(address))
  })

  it('shows the demo list when there is no url', () => {
    renderAt('/hls-dash')

    expect(screen.getByTestId('demo-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('location')).not.toBeInTheDocument()
  })
})
