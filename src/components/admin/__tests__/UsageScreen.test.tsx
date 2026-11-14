import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UsageScreen from '../UsageScreen'
import { AdminSessionContext } from '../AdminSessionContext'

const api = vi.hoisted(() => ({ getUsage: vi.fn() }))
vi.mock('../../../lib/adminApi', () => ({ getUsage: api.getUsage }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const counts = (n: number) => ({ home: n, twitch: n * 2, youtube: 0, 'hls-dash': n, 'chat-popout': 0, other: 0 })
// Two weeks: Mon 2026-11-02 ... Sun 2026-11-15.
const days = (n: number) =>
  Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 10, 2 + i)).toISOString().slice(0, 10), counts: counts(n) }))

const onExpired = vi.fn()

function renderScreen() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <UsageScreen />
    </AdminSessionContext.Provider>,
  )
}

describe('UsageScreen', () => {
  beforeEach(() => {
    api.getUsage.mockReset()
    onExpired.mockReset()
  })

  it('says it is loading before the first answer', () => {
    api.getUsage.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(api.getUsage).toHaveBeenCalledWith(14, expect.anything())
  })

  it('shows a daily chart, the totals per section and the totals per week', async () => {
    api.getUsage.mockResolvedValue({ kind: 'ok', data: { days: days(1) } })

    renderScreen()

    expect(await screen.findByRole('img', { name: /Pages opened per day/ })).toBeInTheDocument()
    const sections = screen.getByRole('table', { name: 'Pages by section' })
    expect(within(sections).getByRole('row', { name: /^Home 14/ })).toBeInTheDocument()
    expect(within(sections).getByRole('row', { name: /^Twitch 28/ })).toBeInTheDocument()
    expect(within(sections).getByRole('row', { name: /^HLS and DASH 14/ })).toBeInTheDocument()
    expect(within(sections).getByRole('row', { name: /^YouTube 0/ })).toBeInTheDocument()
    expect(within(sections).getByRole('row', { name: /^Chat pop-out 0/ })).toBeInTheDocument()
    expect(within(sections).getByRole('row', { name: /^Other 0/ })).toBeInTheDocument()
    const weeks = screen.getByRole('table', { name: 'Pages by week' })
    expect(within(weeks).getByRole('row', { name: /^2026-11-02 28/ })).toBeInTheDocument()
    expect(within(weeks).getByRole('row', { name: /^2026-11-09 28/ })).toBeInTheDocument()
  })

  it('asks for another window when 30 or 90 days is chosen', async () => {
    api.getUsage.mockResolvedValue({ kind: 'ok', data: { days: days(1) } })
    renderScreen()
    await screen.findByRole('img', { name: /Pages opened per day/ })
    expect(screen.getByRole('button', { name: '14 days' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '30 days' }))

    expect(api.getUsage).toHaveBeenLastCalledWith(30, expect.anything())
    expect(await screen.findByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: '90 days' }))
    expect(api.getUsage).toHaveBeenLastCalledWith(90, expect.anything())
  })

  it('still draws the chart and the tables when nothing was counted', async () => {
    api.getUsage.mockResolvedValue({ kind: 'ok', data: { days: days(0) } })

    renderScreen()

    expect(await screen.findByRole('img', { name: /Pages opened per day/ })).toBeInTheDocument()
    expect(within(screen.getByRole('table', { name: 'Pages by section' })).getByRole('row', { name: /^Home 0/ })).toBeInTheDocument()
  })

  it('shows an error with a retry that asks again', async () => {
    api.getUsage.mockResolvedValueOnce({ kind: 'busy' })
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the usage numbers.')

    api.getUsage.mockResolvedValueOnce({ kind: 'ok', data: { days: days(1) } })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('img', { name: /Pages opened per day/ })).toBeInTheDocument()
  })
})
