import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminPage from '../AdminPage'
import { useAdminSession } from '../../components/admin/AdminSessionContext'

const auth = vi.hoisted(() => ({ token: 'tok' as string | null }))
const api = vi.hoisted(() => ({ getSession: vi.fn() }))

vi.mock('../../lib/adminAuth', () => ({
  getAdminToken: vi.fn(() => auth.token),
  clearAdminToken: vi.fn(() => {
    auth.token = null
  }),
  endAdminSession: vi.fn(() => {
    auth.token = null
  }),
  startAdminSignIn: vi.fn(),
}))
vi.mock('../../lib/adminApi', () => ({ getSession: api.getSession }))

// The screens have their own tests; here they are markers, and the overview one can end the session.
vi.mock('../../components/admin/OverviewScreen', () => ({
  default: function OverviewScreen() {
    const { limits, onExpired } = useAdminSession()
    return (
      <div>
        <p>overview screen (budget {limits.ttDayBudget})</p>
        <button onClick={onExpired}>make the session expire</button>
      </div>
    )
  },
}))
vi.mock('../../components/admin/UsageScreen', () => ({ default: () => <p>usage screen</p> }))
vi.mock('../../components/admin/TtCallsScreen', () => ({ default: () => <p>tt screen</p> }))
vi.mock('../../components/admin/SecurityScreen', () => ({ default: () => <p>security screen</p> }))
vi.mock('../../components/admin/ChannelsScreen', () => ({ default: () => <p>channels screen</p> }))
vi.mock('../../components/admin/PlaylistScreen', () => ({ default: () => <p>playlist screen</p> }))

import { clearAdminToken, endAdminSession, startAdminSignIn } from '../../lib/adminAuth'

const SESSION = { kind: 'ok', data: { limits: { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 } } }

function renderAt(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="admin/*" element={<AdminPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AdminPage', () => {
  beforeEach(() => {
    auth.token = 'tok'
    api.getSession.mockReset()
    vi.mocked(clearAdminToken).mockClear()
    vi.mocked(endAdminSession).mockClear()
    vi.mocked(startAdminSignIn).mockClear()
  })

  describe('signed out', () => {
    it('shows only a sign-in card that says what signing in records, and makes no request', () => {
      auth.token = null

      renderAt('/admin/security')

      expect(screen.getByText(/only for the site owner/i)).toBeInTheDocument()
      expect(screen.getByText(/records the Twitch name of anyone who is not the owner/i)).toBeInTheDocument()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
      expect(screen.queryByText('security screen')).not.toBeInTheDocument()
      expect(api.getSession).not.toHaveBeenCalled()
    })

    it('starts the admin sign-in from the page the owner is on', async () => {
      auth.token = null
      renderAt('/admin/security')

      await userEvent.click(screen.getByRole('button', { name: 'Sign in as admin' }))

      expect(startAdminSignIn).toHaveBeenCalledWith('/admin/security')
    })
  })

  describe('the session check', () => {
    it('shows the menu and the screen for the owner, with only Health greyed out', async () => {
      api.getSession.mockResolvedValue(SESSION)

      renderAt('/admin')

      expect(await screen.findByText('overview screen (budget 1500)')).toBeInTheDocument()
      const nav = screen.getByRole('navigation', { name: 'Admin sections' })
      for (const [name, href] of [
        ['Overview', '/admin'],
        ['Usage', '/admin/usage'],
        ['TT calls', '/admin/tt'],
        ['Security', '/admin/security'],
        ['Channels', '/admin/channels'],
        ['Playlist', '/admin/playlist'],
      ]) {
        expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
      }
      expect(nav).toHaveTextContent('Health')
      expect(nav.querySelectorAll('[aria-disabled="true"]')).toHaveLength(1)
      expect(screen.queryByRole('link', { name: /Health/ })).not.toBeInTheDocument()
      expect(screen.getAllByText('coming later')).toHaveLength(1)
    })

    it.each([
      ['/admin/usage', 'usage screen'],
      ['/admin/tt', 'tt screen'],
      ['/admin/security', 'security screen'],
      ['/admin/channels', 'channels screen'],
      ['/admin/playlist', 'playlist screen'],
    ])('shows the right screen at %s', async (path, marker) => {
      api.getSession.mockResolvedValue(SESSION)

      renderAt(path)

      expect(await screen.findByText(marker)).toBeInTheDocument()
    })

    it('says so for an admin address that is not a screen', async () => {
      api.getSession.mockResolvedValue(SESSION)

      renderAt('/admin/nothing')

      expect(await screen.findByText('That admin page does not exist.')).toBeInTheDocument()
    })

    it('goes back to the sign-in card, saying the session ended, when Twitch no longer knows the token', async () => {
      api.getSession.mockResolvedValue({ kind: 'signed_out' })

      renderAt('/admin')

      expect(await screen.findByText(/Your admin session ended/)).toBeInTheDocument()
      expect(clearAdminToken).toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Sign in as admin' })).toBeInTheDocument()
    })

    it('tells a recorded refusal apart from an unrecorded one', async () => {
      api.getSession.mockResolvedValueOnce({ kind: 'refused', recorded: true })
      const first = renderAt('/admin')
      expect(await screen.findByText('This page is only for the site owner. Your Twitch name was recorded.')).toBeInTheDocument()
      first.unmount()

      api.getSession.mockResolvedValueOnce({ kind: 'refused', recorded: false })
      renderAt('/admin')
      expect(await screen.findByText('This page is only for the site owner.')).toBeInTheDocument()
      expect(screen.queryByText(/was recorded/)).not.toBeInTheDocument()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    })

    it.each([[{ kind: 'unavailable' }], [{ kind: 'busy' }]])('says the server is not answering for %j, and can try again', async (result) => {
      api.getSession.mockResolvedValueOnce(result)
      renderAt('/admin')
      expect(await screen.findByText('The history server is not answering right now.')).toBeInTheDocument()
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument()

      api.getSession.mockResolvedValueOnce(SESSION)
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByText('overview screen (budget 1500)')).toBeInTheDocument()
      expect(api.getSession).toHaveBeenCalledTimes(2)
    })
  })

  describe('leaving', () => {
    it('signs out: the token is revoked at Twitch and forgotten, and the sign-in card comes back', async () => {
      api.getSession.mockResolvedValue(SESSION)
      renderAt('/admin')
      await screen.findByText('overview screen (budget 1500)')

      await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

      expect(endAdminSession).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Sign in as admin' })).toBeInTheDocument()
      expect(screen.queryByText(/Your admin session ended/)).not.toBeInTheDocument()
    })

    it('also revokes the token of a refused sign-in when that person signs out', async () => {
      api.getSession.mockResolvedValue({ kind: 'refused', recorded: true })
      renderAt('/admin')
      await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }))

      expect(endAdminSession).toHaveBeenCalledTimes(1)
      expect(screen.getByRole('button', { name: 'Sign in as admin' })).toBeInTheDocument()
    })

    it('does not revoke when the server says the session already ended', async () => {
      api.getSession.mockResolvedValue({ kind: 'signed_out' })
      renderAt('/admin')
      await screen.findByText(/Your admin session ended/)

      expect(endAdminSession).not.toHaveBeenCalled()
    })

    it('lets a screen end the session when one of its own requests is answered "signed out"', async () => {
      api.getSession.mockResolvedValue(SESSION)
      renderAt('/admin')
      await screen.findByText('overview screen (budget 1500)')

      await userEvent.click(screen.getByRole('button', { name: 'make the session expire' }))

      await waitFor(() => expect(screen.getByText(/Your admin session ended/)).toBeInTheDocument())
      expect(clearAdminToken).toHaveBeenCalled()
    })

    it('links back to PRISM', async () => {
      api.getSession.mockResolvedValue(SESSION)
      renderAt('/admin')

      expect(await screen.findByRole('link', { name: /Back to PRISM/ })).toHaveAttribute('href', '/')
    })
  })
})
