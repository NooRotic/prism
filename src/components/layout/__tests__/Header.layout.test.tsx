import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const bar = (container: HTMLElement) => container.querySelector('[data-header-bar]') as HTMLElement

afterEach(() => {
  auth.isAuthenticated = false
})

// The header's height is whatever its content needs (the second row unfolds inside it) and is published as
// --header-height for everything that sits under it.
describe('Header layout', () => {
  it('lets the paste box shrink to the room the buttons leave it on a phone, and keeps its own size from 640 px up', () => {
    const { container } = renderHeader()

    const holder = screen.getByTestId('smart-url-input').parentElement
    expect(holder?.className).toContain('min-w-0')
    expect(holder?.className).toContain('flex-1')
    expect(holder?.className).toContain('sm:flex-none')
    expect(container.querySelector('[data-header-actions]')?.contains(holder)).toBe(true)
  })

  it('keeps each Twitch tool label on one line, with tighter padding on a phone (signed in)', async () => {
    auth.isAuthenticated = true
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Twitch tools' }))

    const row = document.getElementById('header-row') as HTMLElement
    const buttons = within(row).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Following', 'Your Stats', 'Browse'])
    for (const button of buttons) {
      expect(button.className).toContain('whitespace-nowrap')
      expect(button.className).toContain('px-2')
      expect(button.className).toContain('sm:px-3')
    }
  })

  it('keeps the smaller side padding on a phone and the roomy one from 640 px up', () => {
    const { container } = renderHeader()

    expect(bar(container).className).toContain('px-3')
    expect(bar(container).className).toContain('sm:px-6')
  })

  it('keeps the bar 56 px tall: trimmed vertical padding and a 56 px floor', () => {
    const { container } = renderHeader()

    expect(bar(container).className).toMatch(/(^| )py-2( |$)/)
    expect(bar(container).className).not.toContain('py-3')
    expect(bar(container).className).toContain('min-h-14')
  })
})
