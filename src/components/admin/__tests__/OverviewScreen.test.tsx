import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewScreen from '../OverviewScreen'
import { AdminSessionContext } from '../AdminSessionContext'

const api = vi.hoisted(() => ({ getOverview: vi.fn() }))
vi.mock('../../../lib/adminApi', () => ({ getOverview: api.getOverview }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const chart = Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 30 + i)).toISOString().slice(0, 10), pages: i }))

const OVERVIEW = {
  pages: { today: 17, yesterday: 5 },
  chart,
  newChannels: { last24h: 7 },
  tt: { today: 312, paused: false },
  refused: { named7d: 2, signedOutToday: 14 },
  needsAttention: [] as string[],
}

const onExpired = vi.fn()

function renderScreen() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <OverviewScreen />
    </AdminSessionContext.Provider>,
  )
}

describe('OverviewScreen', () => {
  beforeEach(() => {
    api.getOverview.mockReset()
    onExpired.mockReset()
  })

  it('says it is loading before the first answer', () => {
    api.getOverview.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('shows the four numbers against their limits, and the 14-day chart', async () => {
    api.getOverview.mockResolvedValue({ kind: 'ok', data: OVERVIEW })

    renderScreen()

    expect(await screen.findByText('Pages opened today')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText('+12 vs yesterday')).toBeInTheDocument()
    expect(screen.getByText('New channels (last 24 hours)')).toBeInTheDocument()
    expect(screen.getByText('7 of 200')).toBeInTheDocument()
    expect(screen.getByText('TwitchTracker calls today')).toBeInTheDocument()
    expect(screen.getByText('312 of 1,500')).toBeInTheDocument()
    expect(screen.getByText('Refused attempts')).toBeInTheDocument()
    expect(screen.getByText('2 named')).toBeInTheDocument()
    expect(screen.getByText(/14 signed out today/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Pages opened per day/ })).toBeInTheDocument()
    expect(screen.getByText('Nothing needs a look.')).toBeInTheDocument()
  })

  it('says when TwitchTracker calls are paused', async () => {
    api.getOverview.mockResolvedValue({ kind: 'ok', data: { ...OVERVIEW, tt: { today: 1500, paused: true }, needsAttention: ['tt_paused'] } })

    renderScreen()

    expect(await screen.findByText('1,500 of 1,500')).toBeInTheDocument()
    expect(screen.getAllByText(/paused/i).length).toBeGreaterThan(0)
  })

  it('lists what needs a look, one sentence each', async () => {
    api.getOverview.mockResolvedValue({
      kind: 'ok',
      data: { ...OVERVIEW, needsAttention: ['tt_paused', 'job_stale', 'tt_budget_80', 'named_refused_7d'] },
    })

    renderScreen()

    expect(await screen.findByText('TwitchTracker calls are paused.')).toBeInTheDocument()
    expect(screen.getByText('The scheduled refresh has not run in over 8 hours.')).toBeInTheDocument()
    expect(screen.getByText("Today's TwitchTracker calls are above 80% of the budget.")).toBeInTheDocument()
    expect(screen.getByText('Someone tried the admin sign-in and was refused in the last 7 days.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing needs a look.')).not.toBeInTheDocument()
  })

  it('still draws everything when every number is zero', async () => {
    api.getOverview.mockResolvedValue({
      kind: 'ok',
      data: {
        pages: { today: 0, yesterday: 0 },
        chart: chart.map((d) => ({ ...d, pages: 0 })),
        newChannels: { last24h: 0 },
        tt: { today: 0, paused: false },
        refused: { named7d: 0, signedOutToday: 0 },
        needsAttention: [],
      },
    })

    renderScreen()

    expect(await screen.findByText('same as yesterday')).toBeInTheDocument()
    expect(screen.getByText('0 of 200')).toBeInTheDocument()
    expect(screen.getByText('0 of 1,500')).toBeInTheDocument()
    expect(screen.getByText('0 named')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Pages opened per day/ })).toBeInTheDocument()
  })

  it('shows an error with a retry that asks again', async () => {
    api.getOverview.mockResolvedValueOnce({ kind: 'unavailable' })
    renderScreen()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the overview.')

    api.getOverview.mockResolvedValueOnce({ kind: 'ok', data: OVERVIEW })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Pages opened today')).toBeInTheDocument()
    expect(api.getOverview).toHaveBeenCalledTimes(2)
  })

  it('ends the admin session when the server says signed out', async () => {
    api.getOverview.mockResolvedValue({ kind: 'signed_out' })

    renderScreen()

    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1))
  })
})
