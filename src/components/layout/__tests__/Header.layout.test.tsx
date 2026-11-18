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
const classesOf = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/)

afterEach(() => {
  auth.isAuthenticated = false
})

// Folded, the header is one row at every width (measured 2026-11-18: 491 px of content at 360 px before compacting),
// 56 px tall, and never makes the page scroll sideways (the bug the old header had on a phone).
describe('Header layout', () => {
  it('keeps the folded header on one row at every width', () => {
    const { container } = renderHeader()

    expect(classesOf(bar(container))).toContain('flex-nowrap')
    expect(classesOf(bar(container))).not.toContain('flex-wrap')
    expect(classesOf(bar(container))).toContain('min-h-14')
  })

  it('lets the tab strip shrink and scroll inside itself rather than push the page sideways', () => {
    renderHeader()

    const tabs = classesOf(screen.getByRole('navigation', { name: 'Sections' }))
    expect(tabs).toContain('min-w-0')
    expect(tabs).toContain('overflow-x-auto')
  })

  // Measured 2026-11-18: at 640 px the wordmark and the full tab labels together clipped HLS/DASH to "HLS/D"; the tabs
  // win, so the wordmark waits until 768 px.
  it('shows the wordmark only from 768 px, and a smaller mark below 640 px', () => {
    const { container } = renderHeader()

    expect(classesOf(screen.getByText('PRISM'))).toEqual(expect.arrayContaining(['hidden', 'md:inline']))
    expect(classesOf(screen.getByText('PRISM'))).not.toContain('sm:inline')
    const mark = container.querySelector('a[aria-label="Return to home"] > :first-child')
    expect(classesOf(mark)).toEqual(expect.arrayContaining(['w-10', 'sm:w-16']))
  })

  it('shortens HLS/DASH to HLS below 640 px', () => {
    renderHeader()

    const link = screen.getByRole('link', { name: 'HLS/DASH' })
    expect(classesOf(within(link).getByText('HLS/DASH'))).toEqual(expect.arrayContaining(['hidden', 'sm:inline']))
    expect(classesOf(within(link).getByText('HLS'))).toContain('sm:hidden')
  })

  it('trades the Sign in text and the empty dots for a person icon below 440 px', () => {
    renderHeader()

    const pill = screen.getByRole('button', { name: /^Accounts:/ })
    expect(classesOf(within(pill).getByText('Sign in'))).toContain('max-[439px]:hidden')
    expect(classesOf(pill.querySelector('[data-accounts-badges]'))).toContain('max-[439px]:hidden')
    expect(classesOf(pill.querySelector('[data-accounts-icon]'))).toContain('min-[440px]:hidden')
  })

  it('keeps the two account badges at every width once something is connected', () => {
    auth.isAuthenticated = true
    renderHeader()

    const pill = screen.getByRole('button', { name: /^Accounts:/ })
    expect(classesOf(pill.querySelector('[data-accounts-badges]'))).not.toContain('max-[439px]:hidden')
    expect(pill.querySelector('[data-accounts-icon]')).toBeNull()
  })

  it('keeps the smaller side padding on a phone and the roomy one from 640 px up', () => {
    const { container } = renderHeader()

    expect(classesOf(bar(container))).toEqual(expect.arrayContaining(['px-3', 'sm:px-6']))
  })

  it('keeps the bar 56 px tall: trimmed vertical padding and a 56 px floor', () => {
    const { container } = renderHeader()

    expect(classesOf(bar(container))).toContain('py-2')
    expect(classesOf(bar(container))).not.toContain('py-3')
    expect(classesOf(bar(container))).toContain('min-h-14')
  })

  it('keeps each Twitch tool label on one line, with tighter padding on a phone (signed in)', async () => {
    auth.isAuthenticated = true
    renderHeader()
    await userEvent.click(screen.getByRole('button', { name: 'Twitch tools' }))

    const row = document.getElementById('header-row') as HTMLElement
    const buttons = within(row).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Following', 'Your Stats', 'Browse'])
    for (const button of buttons) {
      expect(classesOf(button)).toEqual(expect.arrayContaining(['whitespace-nowrap', 'px-2', 'sm:px-3']))
    }
  })
})
