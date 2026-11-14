import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SecurityScreen from '../SecurityScreen'
import { AdminSessionContext } from '../AdminSessionContext'

const api = vi.hoisted(() => ({ getSecurity: vi.fn() }))
vi.mock('../../../lib/adminApi', () => ({ getSecurity: api.getSecurity }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const attempt = (overrides = {}) => ({
  twitchId: '2000',
  login: 'stranger',
  firstAttemptAt: '2026-11-12 03:00:00',
  lastAttemptAt: '2026-11-12 04:00:00',
  attempts: 2,
  viaScript: false,
  ...overrides,
})
const change = (overrides = {}) => ({ at: '2026-11-12 03:00:00', action: 'channel.remove', target: 'alice', detail: 'twitch_id=1', ...overrides })

const onExpired = vi.fn()

function renderScreen() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <SecurityScreen />
    </AdminSessionContext.Provider>,
  )
}

describe('SecurityScreen', () => {
  beforeEach(() => {
    api.getSecurity.mockReset()
    onExpired.mockReset()
  })

  it('says it is loading before the first answer', () => {
    api.getSecurity.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('lists the named refused attempts as "token of", with when and how often, and the day\'s signed-out count', async () => {
    api.getSecurity.mockResolvedValue({
      kind: 'ok',
      data: { signedOutToday: 14, attempts: [attempt(), attempt({ twitchId: '3000', login: 'scripted', viaScript: true, attempts: 1 })], audit: [change()] },
    })

    renderScreen()

    const attempts = await screen.findByRole('table', { name: 'Refused attempts' })
    const first = within(attempts).getByRole('row', { name: /stranger/ })
    expect(first).toHaveTextContent('token of stranger')
    expect(first).toHaveTextContent('2026-11-12 03:00 UTC')
    expect(first).toHaveTextContent('2026-11-12 04:00 UTC')
    expect(first).toHaveTextContent('2')
    expect(screen.getByText(/14 requests without a valid sign-in today/)).toBeInTheDocument()
  })

  it('marks only the attempts a script sent, with the words "not via the admin sign-in"', async () => {
    api.getSecurity.mockResolvedValue({
      kind: 'ok',
      data: { signedOutToday: 0, attempts: [attempt(), attempt({ twitchId: '3000', login: 'scripted', viaScript: true })], audit: [] },
    })

    renderScreen()

    const attempts = await screen.findByRole('table', { name: 'Refused attempts' })
    expect(within(within(attempts).getByRole('row', { name: /scripted/ })).getByText('not via the admin sign-in')).toBeInTheDocument()
    expect(within(within(attempts).getByRole('row', { name: /stranger/ })).queryByText('not via the admin sign-in')).not.toBeInTheDocument()
  })

  it('shows a name made of markup as visible text and makes no element from it', async () => {
    api.getSecurity.mockResolvedValue({
      kind: 'ok',
      data: {
        signedOutToday: 0,
        attempts: [attempt({ login: '<img src=x onerror=alert(1)>' })],
        audit: [change({ target: '<b>bold</b>', detail: '<script>alert(1)</script>' })],
      },
    })

    const { container } = renderScreen()

    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
    expect(screen.getByText('<b>bold</b>')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('lists the recent changes, newest first as the server sent them', async () => {
    api.getSecurity.mockResolvedValue({
      kind: 'ok',
      data: {
        signedOutToday: 0,
        attempts: [],
        audit: [change({ target: 'newest', at: '2026-11-12 05:00:00' }), change({ action: 'channel.unblock', target: 'older' })],
      },
    })

    renderScreen()

    const changes = await screen.findByRole('table', { name: 'Recent changes' })
    const rows = within(changes).getAllByRole('row').slice(1) // the first row is the column headings
    expect(rows[0]).toHaveTextContent('newest')
    expect(rows[0]).toHaveTextContent('2026-11-12 05:00 UTC')
    expect(rows[0]).toHaveTextContent('channel.remove')
    expect(rows[1]).toHaveTextContent('channel.unblock')
    expect(rows[1]).toHaveTextContent('older')
  })

  it('says so when there is nothing to list', async () => {
    api.getSecurity.mockResolvedValue({ kind: 'ok', data: { signedOutToday: 0, attempts: [], audit: [] } })

    renderScreen()

    expect(await screen.findByText('No refused attempts.')).toBeInTheDocument()
    expect(screen.getByText('No admin changes yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows an error with a retry that asks again', async () => {
    api.getSecurity.mockResolvedValueOnce({ kind: 'unavailable' })
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the security numbers.')

    api.getSecurity.mockResolvedValueOnce({ kind: 'ok', data: { signedOutToday: 0, attempts: [], audit: [] } })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('No refused attempts.')).toBeInTheDocument()
  })
})
