import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HostsSection from '../HostsSection'
import { AdminSessionContext } from '../AdminSessionContext'
import type { AdminHosts } from '../../../lib/adminApi'

const api = vi.hoisted(() => ({ getHosts: vi.fn(), trustHost: vi.fn(), untrustHost: vi.fn() }))
vi.mock('../../../lib/adminApi', async (importActual) => ({ ...(await importActual<typeof import('../../../lib/adminApi')>()), ...api }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const onExpired = vi.fn()

const hosts = (over: Partial<AdminHosts> = {}): AdminHosts => ({
  restorable: [{ host: 'content.uplynk.com', streams: 36 }],
  trusted: [{ host: 'solo.test', addedAt: '2026-11-16 06:00:00', streams: 4, listed: 3 }],
  ...over,
})

function renderSection() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <HostsSection />
    </AdminSessionContext.Provider>,
  )
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  onExpired.mockReset()
  api.getHosts.mockResolvedValue({ kind: 'ok', data: hosts() })
})

describe('HostsSection', () => {
  it('lists the hosts with hidden streams and the trusted ones', async () => {
    renderSection()

    const hidden = await screen.findByRole('table', { name: 'Hosts with hidden streams' })
    expect(within(hidden).getByText('content.uplynk.com')).toBeInTheDocument()
    expect(within(hidden).getByText('36')).toBeInTheDocument()
    const trusted = screen.getByRole('table', { name: 'Trusted hosts' })
    expect(within(trusted).getByText('solo.test')).toBeInTheDocument()
    expect(within(trusted).getByText('3 of 4')).toBeInTheDocument()
  })

  it('asks before restoring, then restores and says how many came back', async () => {
    api.trustHost.mockResolvedValue({ kind: 'ok', data: { restored: 36, snapshot: true } })
    renderSection()

    await userEvent.click(await screen.findByRole('button', { name: 'Restore content.uplynk.com' }))
    expect(api.trustHost).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm: restore 36 streams' }))

    expect(api.trustHost).toHaveBeenCalledWith('content.uplynk.com', expect.anything())
    expect(await screen.findByRole('status')).toHaveTextContent('Restored 36 streams from content.uplynk.com.')
    expect(api.getHosts).toHaveBeenCalledTimes(2)
  })

  it('cancelling the confirmation changes nothing', async () => {
    renderSection()

    await userEvent.click(await screen.findByRole('button', { name: 'Restore content.uplynk.com' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(api.trustHost).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Restore content.uplynk.com' })).toBeInTheDocument()
  })

  it('restores a host typed in, lower-cased and trimmed', async () => {
    api.trustHost.mockResolvedValue({ kind: 'ok', data: { restored: 2, snapshot: false } })
    renderSection()

    await userEvent.type(await screen.findByLabelText('Another host'), '  Other.Example.COM ')
    await userEvent.click(screen.getByRole('button', { name: 'Restore host' }))

    expect(api.trustHost).toHaveBeenCalledWith('other.example.com', expect.anything())
    expect(await screen.findByRole('status')).toHaveTextContent('could not be refreshed yet')
  })

  it('says so when no stream is stored under the host or the name is not a host', async () => {
    api.trustHost.mockResolvedValueOnce({ kind: 'not_found' }).mockResolvedValueOnce({ kind: 'rejected' })
    renderSection()
    const input = await screen.findByLabelText('Another host')

    await userEvent.type(input, 'nothere.test')
    await userEvent.click(screen.getByRole('button', { name: 'Restore host' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No stream is stored under nothere.test.')

    await userEvent.clear(input)
    await userEvent.type(input, 'a/b')
    await userEvent.click(screen.getByRole('button', { name: 'Restore host' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not a host name')
  })

  it('stops trusting a host and reloads', async () => {
    api.untrustHost.mockResolvedValue({ kind: 'ok', data: { ok: true } })
    renderSection()

    await userEvent.click(await screen.findByRole('button', { name: 'Stop trusting solo.test' }))

    expect(api.untrustHost).toHaveBeenCalledWith('solo.test', expect.anything())
    expect(await screen.findByRole('status')).toHaveTextContent('solo.test is judged by the checker again.')
  })

  it('ends the admin session when the server says signed out', async () => {
    api.trustHost.mockResolvedValue({ kind: 'signed_out' })
    renderSection()

    await userEvent.click(await screen.findByRole('button', { name: 'Restore content.uplynk.com' }))
    await userEvent.click(screen.getByRole('button', { name: /Confirm: restore/ }))

    expect(onExpired).toHaveBeenCalled()
  })

  it('offers to try again when the list cannot be loaded', async () => {
    api.getHosts.mockResolvedValue({ kind: 'unavailable' })
    renderSection()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the host list.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
