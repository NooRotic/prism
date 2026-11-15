import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import AdminShell from '../AdminShell'

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/admin/health']}>
      <AdminShell onSignOut={vi.fn()}>
        <p>the screen</p>
      </AdminShell>
    </MemoryRouter>,
  )
}

describe('AdminShell', () => {
  it('has a link for every admin screen, Health included', () => {
    renderShell()

    const nav = screen.getByRole('navigation', { name: 'Admin sections' })
    const links = Array.from(nav.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['Overview', '/admin'],
      ['Usage', '/admin/usage'],
      ['TT calls', '/admin/tt'],
      ['Security', '/admin/security'],
      ['Channels', '/admin/channels'],
      ['Playlist', '/admin/playlist'],
      ['Health', '/admin/health'],
    ])
  })

  it('no longer says that Health is coming later', () => {
    renderShell()

    expect(screen.queryByText(/coming later/i)).toBeNull()
  })

  it('marks the screen that is open', () => {
    renderShell()

    expect(screen.getByRole('link', { name: 'Health' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Playlist' })).not.toHaveAttribute('aria-current')
  })
})
