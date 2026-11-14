import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppProvider } from '../../../contexts/AppContext'
import { Header } from '../Header'

const auth = vi.hoisted(() => ({ isAuthenticated: false }))
vi.mock('../../../hooks/useTwitchAuth', () => ({
  useTwitchAuth: () => ({ isAuthenticated: auth.isAuthenticated, login: vi.fn(), logout: vi.fn(), token: null, handleAuthError: vi.fn() }),
}))
vi.mock('../../search/SmartUrlInput', () => ({ SmartUrlInput: () => <div data-testid="smart-url-input" /> }))

function renderHeader() {
  return render(
    <MemoryRouter initialEntries={['/hls-dash']}>
      <AppProvider>
        <Header />
      </AppProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  auth.isAuthenticated = false
})

// A phone is about 375 px wide. The logo, the nav (signed in), the paste box, the debug toggle and the sign-in button do not
// fit one row there, and the page used to scroll sideways. Below 640 px the header wraps onto a second row (the actions);
// it takes the height of its content, and publishes it as --header-height for everything that sits under it.
describe('Header on a narrow screen', () => {
  it.each([[false], [true]])('wraps onto a second row of its own (signed in: %s)', (signedIn) => {
    auth.isAuthenticated = signedIn
    const { container } = renderHeader()

    const header = screen.getByRole('banner')
    expect(header.className).toContain('flex-wrap')
    expect(header.className).toContain('min-h-14')
    expect(header.className).not.toContain('h-(--header-height)')
    const actions = container.querySelector('[data-header-actions]')
    expect(actions?.className).toContain('w-full')
    expect(actions?.className).toContain('sm:w-auto')
    expect(actions?.contains(screen.getByTestId('smart-url-input'))).toBe(true)
  })

  it('lets the paste box shrink to the room the buttons leave it on a phone, and keeps its own size from 640 px up', () => {
    const { container } = renderHeader()

    const holder = screen.getByTestId('smart-url-input').parentElement
    expect(holder?.className).toContain('min-w-0')
    expect(holder?.className).toContain('flex-1')
    expect(holder?.className).toContain('sm:flex-none')
    expect(container.querySelector('[data-header-actions]')?.contains(holder)).toBe(true)
  })

  it('keeps each nav label on one line, with tighter padding on a phone (signed in)', () => {
    auth.isAuthenticated = true
    renderHeader()

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const buttons = Array.from(nav.querySelectorAll('button'))
    expect(buttons.map((button) => button.textContent)).toEqual(['Following', 'Your Stats', 'Browse'])
    for (const button of buttons) {
      expect(button.className).toContain('whitespace-nowrap')
      expect(button.className).toContain('px-2')
      expect(button.className).toContain('sm:px-3')
    }
  })

  it('keeps the smaller side padding on a phone and the roomy one from 640 px up', () => {
    renderHeader()

    const header = screen.getByRole('banner')
    expect(header.className).toContain('px-3')
    expect(header.className).toContain('sm:px-6')
  })

  it('stays 56 px tall on a wide screen: the vertical padding is trimmed so the paste box does not make it taller', () => {
    renderHeader()

    const header = screen.getByRole('banner')
    expect(header.className).toMatch(/(^| )py-2( |$)/)
    expect(header.className).not.toContain('py-3')
  })

  it('lets the logo and the nav wrap onto two rows on a very narrow screen', () => {
    auth.isAuthenticated = true
    const { container } = renderHeader()

    const brand = container.querySelector('[data-header-brand]')
    expect(brand?.className).toContain('flex-wrap')
    expect(brand?.querySelector('nav')).not.toBeNull()
  })
})
