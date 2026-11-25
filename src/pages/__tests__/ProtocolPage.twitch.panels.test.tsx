import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../contexts/AppContext'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'
import { Header } from '../../components/layout/Header'
import ProtocolPage from '../ProtocolPage'

// The Twitch page's sidebar used to have Following and Your Stats buttons that did nothing once signed in. They open
// the same slide-down panels as the header's Twitch row, and the header brings that row up with them.
vi.mock('../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../components/dashboard/TwitchDashboard', () => ({ default: () => <div /> }))
vi.mock('../../components/grid/DemoGrid', () => ({ DemoGrid: () => <div /> }))
vi.mock('../../components/grid/YouTubeGrid', () => ({ YouTubeGrid: () => <div /> }))
vi.mock('../../components/search/SmartUrlInput', () => ({ SmartUrlInput: () => <div /> }))
vi.mock('../../components/search/ChannelSearchDropdown', () => ({ default: () => <div /> }))

function Open() {
  const { state, dispatch } = useApp()
  return (
    <>
      <output data-testid="open-panel">{state.navPanel.open ?? 'none'}</output>
      <button type="button" data-nav-trigger onClick={() => dispatch({ type: 'OPEN_CATEGORY_PANEL', category: 'Chess' })}>
        open category
      </button>
    </>
  )
}

function mount(signedIn: boolean) {
  const login = vi.fn()
  vi.mocked(useTwitchAuth).mockReturnValue({
    token: signedIn ? 't' : null,
    isAuthenticated: signedIn,
    login,
    logout: vi.fn(),
    handleAuthError: vi.fn(),
  })
  render(
    <MemoryRouter initialEntries={['/twitch']}>
      <AppProvider>
        <Header />
        <ProtocolPage protocol="twitch" />
        <Open />
      </AppProvider>
    </MemoryRouter>,
  )
  return { login }
}

const sidebar = (name: string) => screen.getAllByRole('button', { name }).find((b) => !document.getElementById('header-row')?.contains(b))!
const headerRow = () => document.getElementById('header-row') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('the Twitch page sidebar, signed in', () => {
  it('opens Following in the header: the panel opens and the Twitch row comes up with its button shown as open', async () => {
    mount(true)
    expect(screen.getByTestId('open-panel')).toHaveTextContent('none')

    await userEvent.click(sidebar('Following'))

    expect(screen.getByTestId('open-panel')).toHaveTextContent('following')
    expect(within(headerRow()).getByRole('button', { name: 'Following' })).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar('Following')).toHaveAttribute('aria-expanded', 'true')
  })

  it('switches to Your Stats, and a second click on the same button closes the panel', async () => {
    mount(true)
    await userEvent.click(sidebar('Following'))

    await userEvent.click(sidebar('Your Stats'))
    expect(screen.getByTestId('open-panel')).toHaveTextContent('your-stats')
    expect(within(headerRow()).getByRole('button', { name: 'Your Stats' })).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(sidebar('Your Stats'))
    expect(screen.getByTestId('open-panel')).toHaveTextContent('none')
  })
})

describe('what does not bring the Twitch row up', () => {
  it('a Category panel, which has no button there', async () => {
    mount(true)
    await userEvent.click(screen.getByRole('button', { name: 'open category' }))
    expect(screen.getByTestId('open-panel')).toHaveTextContent('category')
    expect(within(headerRow()).queryByRole('button', { name: 'Following' })).toBeNull()
  })

  it('a row the viewer folds with Esc after the panel closed', async () => {
    mount(true)
    await userEvent.click(sidebar('Following'))
    await userEvent.click(sidebar('Following'))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByTestId('open-panel')).toHaveTextContent('none')
    expect(screen.getByRole('button', { name: 'Twitch tools' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('the Twitch page sidebar, signed out', () => {
  it('asks to connect and opens no panel', async () => {
    const { login } = mount(false)

    await userEvent.click(sidebar('Following'))

    expect(login).toHaveBeenCalledOnce()
    expect(screen.getByTestId('open-panel')).toHaveTextContent('none')
  })
})
