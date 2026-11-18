import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { Header } from '../Header'

vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../search/SmartUrlInput', () => ({ SmartUrlInput: () => <div data-testid="smart-url-input" /> }))

const mockedAuth = vi.mocked(useTwitchAuth)

function signIn(isAuthenticated: boolean, login = vi.fn()) {
  mockedAuth.mockReturnValue({ isAuthenticated, login, logout: vi.fn(), token: isAuthenticated ? 'tok' : null, handleAuthError: vi.fn() })
  return login
}

function PanelProbe() {
  const { state } = useApp()
  return <output data-testid="nav-panel">{state.navPanel.open ?? 'none'}</output>
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <Header />
        <PanelProbe />
      </AppProvider>
    </MemoryRouter>,
  )
}

const row = () => document.getElementById('header-row') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  signIn(false)
})

describe('Header: section tabs', () => {
  it('links each section', () => {
    renderAt('/')
    expect(screen.getByRole('link', { name: 'Twitch' })).toHaveAttribute('href', '/twitch')
    expect(screen.getByRole('link', { name: 'YouTube' })).toHaveAttribute('href', '/youtube')
    expect(screen.getByRole('link', { name: 'HLS/DASH' })).toHaveAttribute('href', '/hls-dash')
  })

  it.each([
    ['/twitch/foo', 'Twitch'],
    ['/youtube/catchup', 'YouTube'],
    ['/hls-dash/0123456789ab', 'HLS/DASH'],
  ])('marks the current section on %s', (path, name) => {
    renderAt(path)
    expect(screen.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    const others = screen.getAllByRole('link', { name: /^(Twitch|YouTube|HLS\/DASH)$/ }).filter((l) => l.getAttribute('aria-label') !== name)
    for (const link of others) expect(link).not.toHaveAttribute('aria-current')
  })

  it('marks no section on the hub', () => {
    renderAt('/')
    for (const name of ['Twitch', 'YouTube', 'HLS/DASH']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
  })

  it('gives Twitch and YouTube a tools button and HLS/DASH none', () => {
    renderAt('/')
    expect(screen.getByRole('button', { name: 'Twitch tools' })).toHaveAttribute('aria-controls', 'header-row')
    expect(screen.getByRole('button', { name: 'YouTube tools' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'HLS/DASH tools' })).not.toBeInTheDocument()
  })

  it('underlines the bar in the current section\'s colour', () => {
    const { container, unmount } = renderAt('/youtube/x')
    expect(container.querySelector('[data-header-bar]')).toHaveAttribute('data-section', 'youtube')
    unmount()
    const hub = renderAt('/')
    expect(hub.container.querySelector('[data-header-bar]')).toHaveAttribute('data-section', 'none')
  })
})

describe('Header: the folding row', () => {
  it('opens the Twitch row from its button', async () => {
    signIn(true)
    renderAt('/hls-dash')
    const button = screen.getByRole('button', { name: 'Twitch tools' })
    expect(button).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(button)

    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(row()).toHaveAttribute('data-open', 'true')
    for (const name of ['Following', 'Your Stats', 'Browse']) {
      expect(within(row()).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('asks a signed-out viewer to connect', async () => {
    const login = signIn(false)
    renderAt('/hls-dash')
    await userEvent.click(screen.getByRole('button', { name: 'Twitch tools' }))

    expect(within(row()).getByText('Connect Twitch to see Following, Your Stats and Browse')).toBeInTheDocument()
    await userEvent.click(within(row()).getByRole('button', { name: 'Connect' }))
    expect(login).toHaveBeenCalledOnce()
  })

  it('opens Following from the row, with exactly one nav trigger in the page', async () => {
    signIn(true)
    renderAt('/hls-dash')
    await userEvent.click(screen.getByRole('button', { name: 'Twitch tools' }))
    await userEvent.click(within(row()).getByRole('button', { name: 'Following' }))

    expect(screen.getByTestId('nav-panel')).toHaveTextContent('following')
    expect(document.querySelectorAll('[data-nav-trigger]')).toHaveLength(1)
  })

  it('closes Following when Accounts replaces the Twitch row', async () => {
    signIn(true)
    renderAt('/hls-dash')
    await userEvent.click(screen.getByRole('button', { name: 'Twitch tools' }))
    await userEvent.click(within(row()).getByRole('button', { name: 'Following' }))
    expect(screen.getByTestId('nav-panel')).toHaveTextContent('following')

    await userEvent.click(screen.getByRole('button', { name: /^Accounts:/ }))

    expect(screen.getByTestId('nav-panel')).toHaveTextContent('none')
    expect(within(row()).getByRole('region', { name: 'Twitch' })).toBeInTheDocument()
  })

  it('shows Catch up in the YouTube row', async () => {
    renderAt('/hls-dash')
    await userEvent.click(screen.getByRole('button', { name: 'YouTube tools' }))
    expect(within(row()).getByRole('link', { name: 'Catch up' })).toHaveAttribute('href', '/youtube/catchup')
  })

  it('keeps the row in the page flow', () => {
    renderAt('/hls-dash')
    expect(row().className).not.toMatch(/\b(absolute|fixed)\b/)
    expect(screen.getByRole('banner')).toHaveClass('fill-hide')
  })

  it('closes Browse for good on a second click', async () => {
    signIn(true)
    renderAt('/hls-dash')
    await userEvent.click(screen.getByRole('button', { name: 'Twitch tools' }))
    const browse = within(row()).getByRole('button', { name: 'Browse' })

    await userEvent.click(browse)
    expect(screen.getByPlaceholderText('Search Twitch channels...')).toBeInTheDocument()
    await userEvent.click(browse)

    expect(screen.queryByPlaceholderText('Search Twitch channels...')).not.toBeInTheDocument()
  })

  it('anchors the Browse dropdown on the left, so it stays on screen in a left-aligned row', async () => {
    signIn(true)
    renderAt('/hls-dash')
    await userEvent.click(screen.getByRole('button', { name: 'Twitch tools' }))
    await userEvent.click(within(row()).getByRole('button', { name: 'Browse' }))

    const panel = screen.getByPlaceholderText('Search Twitch channels...').closest('.absolute') as HTMLElement
    expect(panel.className).toContain('left-0')
    expect(panel.className).not.toContain('right-0')
  })
})
