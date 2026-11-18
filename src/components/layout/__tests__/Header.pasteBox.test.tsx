import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { AppProvider } from '../../../contexts/AppContext'
import type { SmartUrlInputProps } from '../../search/SmartUrlInput'
import { Header } from '../Header'

vi.mock('../../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: vi.fn(() => ({
    isAuthenticated: false,
    login: vi.fn(),
    logout: vi.fn(),
    token: null,
    handleAuthError: vi.fn(),
  })),
}))

// A stand-in that records what the header hands the paste box, and how often it is mounted.
const box = vi.hoisted(() => ({ props: null as SmartUrlInputProps | null, mounts: 0 }))
vi.mock('../../search/SmartUrlInput', async () => {
  const { useEffect } = await import('react')
  return {
    SmartUrlInput: (props: SmartUrlInputProps) => {
      box.props = props
      useEffect(() => {
        box.mounts += 1
      }, [])
      return <input data-testid="smart-url-input" />
    },
  }
})

function GoElsewhere() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/hls-dash/elsewhere')}>
      go elsewhere
    </button>
  )
}

function renderHeaderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProvider>
        <Header />
        <GoElsewhere />
      </AppProvider>
    </MemoryRouter>,
  )
}

const icon = () => screen.getByRole('button', { name: 'Paste a link' })

beforeEach(() => {
  box.props = null
  box.mounts = 0
})

// The header carries the paste box everywhere the page itself has none: the hub and the Twitch and YouTube listings
// have their own (the hub's hero, the listing pages' sidebar). It sits behind a link icon until it is wanted.
describe('Header: where the paste box is', () => {
  it.each([['/hls-dash'], ['/hls-dash/'], ['/hls-dash/0123456789ab'], ['/hls-dash/custom'], ['/twitch/streamer'], ['/youtube/abc'], ['/youtube/catchup']])(
    'shows the link icon on %s',
    (path) => {
      renderHeaderAt(path)

      expect(icon()).toHaveAttribute('aria-expanded', 'false')
      expect(box.props?.active).toBe(false)
    },
  )

  it.each([['/'], ['/twitch'], ['/youtube']])('leaves it to the page itself on %s', (path) => {
    renderHeaderAt(path)

    expect(screen.queryByRole('button', { name: 'Paste a link' })).not.toBeInTheDocument()
    expect(screen.queryByTestId('smart-url-input')).not.toBeInTheDocument()
  })
})

describe('Header: opening the paste box', () => {
  it('opens it from the icon and gives it the in-flow list slot', async () => {
    renderHeaderAt('/hls-dash')

    await userEvent.click(icon())

    expect(icon()).toHaveAttribute('aria-expanded', 'true')
    expect(box.props?.active).toBe(true)
    const slot = document.getElementById('header-paste-list')
    expect(slot).not.toBeNull()
    expect(box.props?.listContainer).toBe(slot)
    expect(slot?.className).not.toMatch(/\b(absolute|fixed)\b/)
    expect(slot?.className).toContain('max-h-64')
  })

  it('closes when the box says it is done, with focus back on the icon', async () => {
    renderHeaderAt('/hls-dash')
    await userEvent.click(icon())

    act(() => box.props?.onDone?.())

    expect(box.props?.active).toBe(false)
    expect(icon()).toHaveFocus()
  })

  it('closes when the page changes, even with text typed', async () => {
    renderHeaderAt('/hls-dash')
    await userEvent.click(icon())
    await userEvent.type(screen.getByTestId('smart-url-input'), 'half a link')

    await userEvent.click(screen.getByRole('button', { name: 'go elsewhere' }))

    expect(box.props?.active).toBe(false)
    expect(icon()).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the box mounted however often it opens', async () => {
    renderHeaderAt('/hls-dash')
    await userEvent.click(icon())
    act(() => box.props?.onDone?.())
    await userEvent.click(icon())

    expect(box.mounts).toBe(1)
  })
})
