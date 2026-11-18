import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import { useTwitchAuth } from '../../../hooks/useTwitchAuth'
import { getMyChannel, listSubscriptions } from '../../../lib/catchupApi'
import { setAccount, setSubscriptions } from '../../../lib/catchupStore'
import { GoogleAuthError, isGoogleAuthConfigured, requestYoutubeReadToken } from '../../../lib/googleYoutubeAuth'
import type { TwitchUser } from '../../../types/twitch'
import { Header } from '../Header'

vi.mock('../../../hooks/useTwitchAuth', () => ({ useTwitchAuth: vi.fn() }))
vi.mock('../../search/SmartUrlInput', () => ({ SmartUrlInput: () => <div data-testid="smart-url-input" /> }))
vi.mock('../../../lib/catchupApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/catchupApi')>()
  return { ...actual, listSubscriptions: vi.fn(), getMyChannel: vi.fn() }
})
vi.mock('../../../lib/googleYoutubeAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/googleYoutubeAuth')>()
  return { ...actual, requestYoutubeReadToken: vi.fn(), isGoogleAuthConfigured: vi.fn(() => true) }
})

const mockedAuth = vi.mocked(useTwitchAuth)

function twitch(isAuthenticated: boolean) {
  const fns = { login: vi.fn(), logout: vi.fn() }
  mockedAuth.mockReturnValue({ isAuthenticated, ...fns, token: isAuthenticated ? 'tok' : null, handleAuthError: vi.fn() })
  return fns
}

const USER = { id: '1', login: 'noorotic', display_name: 'NooRotic', profile_image_url: 'https://img/twitch.png' } as TwitchUser

function Seed({ user, expired }: { user?: TwitchUser; expired?: boolean }) {
  const { dispatch } = useApp()
  useEffect(() => {
    if (user) dispatch({ type: 'LOGIN_USER_LOADED', user })
    if (expired) dispatch({ type: 'TOKEN_EXPIRED' })
  }, [dispatch, user, expired])
  return null
}

function DebugProbe() {
  const { state } = useApp()
  return <output data-testid="debug-state">{state.player.debugMode ? 'on' : 'off'}</output>
}

function renderHeader(seed: { user?: TwitchUser; expired?: boolean } = {}, path = '/hls-dash') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <Seed {...seed} />
        <Header />
        <DebugProbe />
      </AppProvider>
    </MemoryRouter>,
  )
}

function setWide(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide && query === '(min-width: 640px)',
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

const pill = () => screen.getByRole('button', { name: /^Accounts:/ })
const row = () => document.getElementById('header-row') as HTMLElement
const youtube = () => within(row()).getByRole('region', { name: 'YouTube' })
const twitchEntry = () => within(row()).getByRole('region', { name: 'Twitch' })
const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
const LIST = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `UC${i}`, title: `Channel ${i}` }))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(isGoogleAuthConfigured).mockReturnValue(true)
  twitch(false)
  setWide(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Accounts: Twitch', () => {
  it('shows a signed-in Twitch account with Sign out', async () => {
    const { logout } = twitch(true)
    renderHeader({ user: USER })
    expect(pill()).toHaveAccessibleName('Accounts: Twitch signed in as NooRotic, YouTube not imported')

    await userEvent.click(pill())

    expect(within(twitchEntry()).getByText('Signed in as NooRotic')).toBeInTheDocument()
    await userEvent.click(within(twitchEntry()).getByRole('button', { name: 'Sign out' }))
    expect(logout).toHaveBeenCalledOnce()
  })

  it('asks to connect when signed out', async () => {
    const { login } = twitch(false)
    renderHeader()
    await userEvent.click(pill())

    expect(within(twitchEntry()).getByText('Not signed in')).toBeInTheDocument()
    await userEvent.click(within(twitchEntry()).getByRole('button', { name: 'Connect' }))
    expect(login).toHaveBeenCalledOnce()
  })

  it('says so when the Twitch session ended', async () => {
    twitch(false)
    renderHeader({ expired: true })
    await userEvent.click(pill())

    expect(within(twitchEntry()).getByText('Your Twitch session ended')).toBeInTheDocument()
    expect(within(twitchEntry()).getByRole('button', { name: 'Connect' })).toBeInTheDocument()
  })

  it('says Signed in, with no picture, while the profile is loading', async () => {
    twitch(true)
    renderHeader()
    expect(pill().querySelector('img')).toBeNull()

    await userEvent.click(pill())

    expect(within(twitchEntry()).getByText('Signed in')).toBeInTheDocument()
    expect(twitchEntry().querySelector('img')).toBeNull()
  })
})

describe('Accounts: YouTube', () => {
  it('describes an import with its account and date', async () => {
    setSubscriptions(LIST(214))
    setAccount({ title: 'NooRotic', thumbnailUrl: 'https://img/yt.jpg', importedAt: Date.UTC(2026, 10, 18, 12) })
    renderHeader()
    expect(pill().querySelector('img[src="https://img/yt.jpg"]')).not.toBeNull()

    await userEvent.click(pill())

    expect(within(youtube()).getByText(`214 subscriptions from NooRotic, imported ${day(Date.UTC(2026, 10, 18, 12))}`)).toBeInTheDocument()
    expect(within(youtube()).getByRole('button', { name: 'Re-import' })).toBeInTheDocument()
  })

  it('drops the name and shows ▶ when the record has no title or picture', async () => {
    setSubscriptions(LIST(1))
    setAccount({ title: '', thumbnailUrl: '', importedAt: Date.UTC(2026, 10, 18, 12) })
    renderHeader()
    expect(pill().querySelector('img')).toBeNull()
    expect(within(pill()).getByText('▶')).toBeInTheDocument()

    await userEvent.click(pill())

    expect(within(youtube()).getByText(`1 subscription, imported ${day(Date.UTC(2026, 10, 18, 12))}`)).toBeInTheDocument()
  })

  it('counts a list imported before account records, without a date', async () => {
    setSubscriptions(LIST(12))
    renderHeader()
    await userEvent.click(pill())

    expect(within(youtube()).getByText('12 subscriptions imported')).toBeInTheDocument()
    expect(within(youtube()).getByRole('button', { name: 'Re-import' })).toBeInTheDocument()
  })

  it('offers Import when nothing was imported', async () => {
    renderHeader()
    await userEvent.click(pill())

    expect(within(youtube()).getByText('Subscriptions not imported')).toBeInTheDocument()
    expect(within(youtube()).getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('shows the import running, then why it failed', async () => {
    let fail!: (e: unknown) => void
    vi.mocked(requestYoutubeReadToken).mockReturnValue(new Promise<string>((_, reject) => (fail = reject)))
    renderHeader()
    await userEvent.click(pill())

    await userEvent.click(within(youtube()).getByRole('button', { name: 'Import' }))

    const busy = within(youtube()).getByRole('button', { name: 'Importing…' })
    expect(busy).toBeDisabled()
    fail(new GoogleAuthError('closed', 'closed'))
    expect(await within(youtube()).findByText('The Google sign-in window was closed, so nothing was imported.')).toBeInTheDocument()
    expect(within(youtube()).getByRole('button', { name: 'Import' })).toBeEnabled()
  })

  it('re-reads after a successful import from the row', async () => {
    vi.mocked(requestYoutubeReadToken).mockResolvedValue('tok')
    vi.mocked(listSubscriptions).mockResolvedValue(LIST(3))
    vi.mocked(getMyChannel).mockResolvedValue({ title: 'NooRotic', thumbnailUrl: '' })
    renderHeader()
    await userEvent.click(pill())

    await userEvent.click(within(youtube()).getByRole('button', { name: 'Import' }))

    expect(await within(youtube()).findByText(/^3 subscriptions from NooRotic, imported /)).toBeInTheDocument()
  })

  it('has no YouTube sign-out', async () => {
    setSubscriptions(LIST(2))
    setAccount({ title: 'NooRotic', thumbnailUrl: '', importedAt: 1 })
    renderHeader()
    await userEvent.click(pill())

    expect(within(youtube()).queryByRole('button', { name: /sign out|log out|disconnect/i })).toBeNull()
    expect(within(youtube()).queryByRole('link', { name: /sign out|log out|disconnect/i })).toBeNull()
  })

  it('links to the YouTube history in a new tab', async () => {
    renderHeader()
    await userEvent.click(pill())

    const link = within(youtube()).getByRole('link', { name: 'History: check on youtube.com ↗' })
    expect(link).toHaveAttribute('href', 'https://www.youtube.com/feed/history')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('says it is not set up when Google sign-in is missing', async () => {
    vi.mocked(isGoogleAuthConfigured).mockReturnValue(false)
    renderHeader()
    await userEvent.click(pill())

    expect(within(youtube()).getByText("Import isn't set up in this build")).toBeInTheDocument()
    expect(within(youtube()).queryByRole('button')).toBeNull()
  })
})

describe('Accounts: the pill', () => {
  it('reads Sign in when nothing is connected', () => {
    renderHeader()
    expect(within(pill()).getByText('Sign in')).toBeInTheDocument()
    expect(pill()).toHaveAccessibleName('Accounts: Twitch not signed in, YouTube not imported')
  })

  it('shows the Twitch picture once the profile has loaded', () => {
    twitch(true)
    renderHeader({ user: USER })
    expect(pill().querySelector('img[src="https://img/twitch.png"]')).not.toBeNull()
    expect(within(pill()).queryByText('Sign in')).toBeNull()
  })
})

describe('Accounts: the debug toggle', () => {
  it('sits in the bar when wide, never twice', async () => {
    setWide(true)
    renderHeader()
    expect(screen.getAllByLabelText('Toggle debug overlay')).toHaveLength(1)
    expect(row().contains(screen.getByLabelText('Toggle debug overlay'))).toBe(false)

    await userEvent.click(screen.getByLabelText('Toggle debug overlay'))
    expect(screen.getByTestId('debug-state')).toHaveTextContent('on')
  })

  it('moves into the Accounts row when narrow, never twice', async () => {
    setWide(false)
    renderHeader()
    await userEvent.click(pill())

    expect(screen.getAllByLabelText('Toggle debug overlay')).toHaveLength(1)
    const toggle = within(row()).getByLabelText('Toggle debug overlay')
    expect(within(row()).getByText('Debug overlay')).toBeInTheDocument()
    await userEvent.click(toggle)
    expect(screen.getByTestId('debug-state')).toHaveTextContent('on')
  })
})
