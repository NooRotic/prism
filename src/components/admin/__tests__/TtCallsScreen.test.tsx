import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TtCallsScreen from '../TtCallsScreen'
import { AdminSessionContext } from '../AdminSessionContext'

const api = vi.hoisted(() => ({ getTt: vi.fn() }))
vi.mock('../../../lib/adminApi', () => ({ getTt: api.getTt }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const days = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10), calls: i * 10 }))
const LAST_RUN = { atMs: Date.UTC(2026, 10, 12, 2, 17), stoppedBy: 'done', profiles: 4, gone: 0, dormant: 1, ttOk: 12, ttUntracked: 3, ttError: 1, ttSkipped: 0 }

const onExpired = vi.fn()

function renderScreen() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <TtCallsScreen />
    </AdminSessionContext.Provider>,
  )
}

describe('TtCallsScreen', () => {
  beforeEach(() => {
    api.getTt.mockReset()
    onExpired.mockReset()
  })

  it('says it is loading before the first answer', () => {
    api.getTt.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(api.getTt).toHaveBeenCalledWith(30, expect.anything())
  })

  it('shows calls per day against the day budget, that calls are not paused, and the last run', async () => {
    api.getTt.mockResolvedValue({ kind: 'ok', data: { days, pausedUntil: null, lastRun: LAST_RUN } })

    renderScreen()

    expect(await screen.findByRole('img', { name: /TwitchTracker calls per day/ })).toBeInTheDocument()
    expect(screen.getByText(/Budget: 1,500 calls a day/)).toBeInTheDocument()
    expect(screen.getByText('Not paused')).toBeInTheDocument()
    expect(screen.getByText('2026-11-12 02:17 UTC')).toBeInTheDocument()
    expect(screen.getByText(/12 answered, 3 untracked, 1 error, 0 skipped/)).toBeInTheDocument()
    expect(screen.getByText(/Stopped by: done/)).toBeInTheDocument()
  })

  it('says until when calls are paused', async () => {
    api.getTt.mockResolvedValue({ kind: 'ok', data: { days, pausedUntil: '2026-11-13 00:00:00', lastRun: LAST_RUN } })

    renderScreen()

    expect(await screen.findByText('Calls resume at 2026-11-13 00:00 UTC')).toBeInTheDocument()
    expect(screen.queryByText('Not paused')).not.toBeInTheDocument()
  })

  it('says so when no scheduled run has been recorded yet, and still draws the chart', async () => {
    api.getTt.mockResolvedValue({ kind: 'ok', data: { days: days.map((d) => ({ ...d, calls: 0 })), pausedUntil: null, lastRun: null } })

    renderScreen()

    expect(await screen.findByText('No run recorded yet.')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /TwitchTracker calls per day/ })).toBeInTheDocument()
  })

  it('asks for another window when 14 or 90 days is chosen', async () => {
    api.getTt.mockResolvedValue({ kind: 'ok', data: { days, pausedUntil: null, lastRun: null } })
    renderScreen()
    await screen.findByRole('img', { name: /TwitchTracker calls per day/ })
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '14 days' }))
    expect(api.getTt).toHaveBeenLastCalledWith(14, expect.anything())

    await userEvent.click(screen.getByRole('button', { name: '90 days' }))
    expect(api.getTt).toHaveBeenLastCalledWith(90, expect.anything())
  })

  it('shows an error with a retry that asks again', async () => {
    api.getTt.mockResolvedValueOnce({ kind: 'unavailable' })
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the TwitchTracker numbers.')

    api.getTt.mockResolvedValueOnce({ kind: 'ok', data: { days, pausedUntil: null, lastRun: null } })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Not paused')).toBeInTheDocument()
  })
})
