import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HealthScreen from '../HealthScreen'
import { AdminSessionContext } from '../AdminSessionContext'
import type { AdminChecker } from '../../../lib/adminApi'

const api = vi.hoisted(() => ({ getChecker: vi.fn(), applyChecker: vi.fn(), setCheckerPaused: vi.fn(), getHosts: vi.fn() }))
vi.mock('../../../lib/adminApi', async (importActual) => ({ ...(await importActual<typeof import('../../../lib/adminApi')>()), ...api }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const onExpired = vi.fn()

function checker(over: Partial<AdminChecker> = {}): AdminChecker {
  return {
    mode: 'shadow',
    appliedAt: null,
    paused: false,
    progress: { eligible: 3995, checked: 3412, oldestResultAt: '2026-11-15 00:10:00' },
    outcome: { pass: 2500, unreachable: 800, no_cors: 12 },
    wouldHide: 812,
    counts: { new: 3995, held: 483 },
    clusters: [{ host: 'bad.test', streams: 12, failed: 9 }],
    guardedHosts: [{ host: 'guard.test', streams: 3 }],
    flagged: [{ publicId: '0123456789ab', name: 'Pinned one', pinned: true, isDefault: false, state: 'dead' }],
    budget: { bytesToday: 5000, dailyCap: 1073741824, firstPassBytes: 52_428_800, firstPassCap: 4294967296 },
    lastStop: { reason: 'run_guard', at: '2026-11-15 00:30:00' },
    ...over,
  }
}

const ok = (data: AdminChecker) => ({ kind: 'ok', data })

function renderScreen() {
  return render(
    <MemoryRouter>
      <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
        <HealthScreen />
      </AdminSessionContext.Provider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset()
  onExpired.mockReset()
  api.getChecker.mockResolvedValue(ok(checker()))
  api.getHosts.mockResolvedValue({ kind: 'ok', data: { trusted: [], restorable: [] } })
})

describe('HealthScreen: reading', () => {
  it('says it is loading before the first answer', () => {
    api.getChecker.mockReturnValue(new Promise(() => {}))

    renderScreen()

    expect(screen.getByRole('status')).toHaveTextContent('Loading')
  })

  it('offers to try again when the server does not answer', async () => {
    api.getChecker.mockResolvedValueOnce({ kind: 'unavailable' })
    renderScreen()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(api.getChecker).toHaveBeenCalledTimes(2)
    expect(await screen.findByText(/Shadow run/)).toBeInTheDocument()
  })

  it('shows the shadow run: where the first pass stands, and that nothing visitors see has changed', async () => {
    renderScreen()

    expect(await screen.findByText(/Shadow run/)).toBeInTheDocument()
    expect(screen.getByText(/Nothing visitors see has changed yet/)).toBeInTheDocument()
    expect(screen.getByText('3,412 of 3,995 checked')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'First pass progress' })
    expect(bar).toHaveAttribute('aria-valuenow', '3412')
    expect(bar).toHaveAttribute('aria-valuemax', '3995')
    expect(screen.getByText(/2026-11-15 00:10 UTC/)).toBeInTheDocument()
  })

  it('says how many streams Apply would hide and lists the outcome by result code', async () => {
    renderScreen()

    expect(await screen.findByText(/Apply would hide 812 streams/)).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'First pass results' })
    expect(within(table).getByRole('row', { name: /unreachable/ })).toHaveTextContent('800')
    expect(within(table).getByRole('row', { name: /pass/ })).toHaveTextContent('2,500')
    expect(within(table).getByRole('row', { name: /no_cors/ })).toHaveTextContent('12')
  })

  it('names the hosts where more than half of the streams failed, with a reason to look twice', async () => {
    renderScreen()

    const table = await screen.findByRole('table', { name: 'Hosts where most streams failed' })
    expect(within(table).getByRole('row', { name: /bad\.test/ })).toHaveTextContent('9 of 12')
    expect(screen.getByText(/may be down, or blocking this server/)).toBeInTheDocument()
  })

  it('lists the guarded hosts, the flagged streams, the counts per state, the budget and the last early stop', async () => {
    renderScreen()

    expect(await screen.findByText(/guard\.test/)).toHaveTextContent('3 streams')
    expect(screen.getByText(/Pinned one/)).toHaveTextContent('pinned')
    expect(screen.getByText(/Pinned one/)).toHaveTextContent('dead')
    expect(screen.getByText('new: 3,995')).toBeInTheDocument()
    expect(screen.getByText('held: 483')).toBeInTheDocument()
    expect(screen.getByText(/0\.0 MB of 1,024 MB today/)).toBeInTheDocument()
    expect(screen.getByText(/First pass: 50\.0 MB of 4,096 MB/)).toBeInTheDocument()
    expect(screen.getByText(/stopped early: run_guard/)).toHaveTextContent('2026-11-15 00:30 UTC')
  })

  it('leaves out what is empty', async () => {
    api.getChecker.mockResolvedValue(ok(checker({ clusters: [], guardedHosts: [], flagged: [], lastStop: null, outcome: {}, wouldHide: 0 })))
    renderScreen()

    expect(await screen.findByText(/Shadow run/)).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Hosts where most streams failed' })).toBeNull()
    expect(screen.queryByText(/stopped early/)).toBeNull()
    expect(screen.queryByText(/guard\.test/)).toBeNull()
    expect(screen.getByText(/Apply would hide 0 streams/)).toBeInTheDocument()
  })

  it('shows host and stream names as plain text, never as markup', async () => {
    api.getChecker.mockResolvedValue(ok(checker({ clusters: [{ host: '<b>evil</b>.test', streams: 5, failed: 4 }], flagged: [{ publicId: 'a'.repeat(12), name: '<i>name</i>', pinned: false, isDefault: true, state: 'dead' }] })))
    renderScreen()

    const table = await screen.findByRole('table', { name: 'Hosts where most streams failed' })
    expect(table).toHaveTextContent('<b>evil</b>.test')
    expect(table.querySelector('b')).toBeNull()
    expect(screen.getByText(/<i>name<\/i>/)).toBeInTheDocument()
  })

  it('links to the Playlist screen for the lists of dead, removed and unplayable streams', async () => {
    renderScreen()

    expect(await screen.findByRole('link', { name: /Playlist screen/ })).toHaveAttribute('href', '/admin/playlist')
  })
})

describe('HealthScreen: live', () => {
  it('says since when it is live, and has no Apply button and no "would hide"', async () => {
    api.getChecker.mockResolvedValue(ok(checker({ mode: 'live', appliedAt: '2026-11-15 02:00:00', wouldHide: 0 })))
    renderScreen()

    expect(await screen.findByText(/Live since 2026-11-15 02:00 UTC/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply the first pass' })).toBeNull()
    expect(screen.queryByText(/Apply would hide/)).toBeNull()
  })
})

describe('HealthScreen: the kill switch', () => {
  it('pauses, and shows the checker as paused with a button to resume', async () => {
    api.setCheckerPaused.mockResolvedValue({ kind: 'ok', data: { paused: true } })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Pause the checker' }))

    expect(api.setCheckerPaused).toHaveBeenCalledWith(true, expect.anything())
    expect(api.getChecker).toHaveBeenCalledTimes(2)
  })

  it('resumes a paused checker', async () => {
    api.getChecker.mockResolvedValue(ok(checker({ paused: true })))
    api.setCheckerPaused.mockResolvedValue({ kind: 'ok', data: { paused: false } })
    renderScreen()

    expect(await screen.findByText('Paused')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Resume the checker' }))

    expect(api.setCheckerPaused).toHaveBeenCalledWith(false, expect.anything())
  })

  it('says so when the switch could not be flipped', async () => {
    api.setCheckerPaused.mockResolvedValue({ kind: 'unavailable' })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Pause the checker' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change the pause switch')
  })
})

describe('HealthScreen: Apply', () => {
  it('asks first, saying how many streams will be hidden, and Cancel changes nothing', async () => {
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Apply the first pass' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent('hide 812 streams')
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(api.applyChecker).not.toHaveBeenCalled()
  })

  it('applies after the confirmation, says what happened and reloads the status', async () => {
    api.applyChecker.mockResolvedValue({ kind: 'ok', data: { hidden: 812, listed: 3183, snapshot: true, already: false } })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Apply the first pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm apply' }))

    expect(api.applyChecker).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Applied: 812 hidden, 3,183 listed/)).toBeInTheDocument()
    expect(api.getChecker).toHaveBeenCalledTimes(2)
  })

  it('says when the visitor list could not be refreshed yet', async () => {
    api.applyChecker.mockResolvedValue({ kind: 'ok', data: { hidden: 1, listed: 2, snapshot: false, already: false } })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Apply the first pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm apply' }))

    expect(await screen.findByText(/visitor list could not be refreshed yet/)).toBeInTheDocument()
  })

  it.each([
    ['incomplete', /first pass is not finished/],
    ['stale', /older than 3 days/],
    ['too_many_failures', /Two thirds or more of the checks failed/],
  ] as const)('says why a refused Apply (%s) changed nothing', async (reason, text) => {
    api.applyChecker.mockResolvedValue({ kind: 'refused_apply', reason })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Apply the first pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm apply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(api.getChecker).toHaveBeenCalledTimes(1)
  })

  it('says so when the server did not answer', async () => {
    api.applyChecker.mockResolvedValue({ kind: 'unavailable' })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Apply the first pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm apply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not apply')
  })

  it('ends the admin session when the answer is signed out', async () => {
    api.applyChecker.mockResolvedValue({ kind: 'signed_out' })
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Apply the first pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm apply' }))

    expect(onExpired).toHaveBeenCalled()
  })

  it('locks the buttons while a request is out', async () => {
    let finish: (value: unknown) => void = () => {}
    api.applyChecker.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    renderScreen()

    await userEvent.click(await screen.findByRole('button', { name: 'Apply the first pass' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm apply' }))

    expect(screen.getByRole('button', { name: 'Pause the checker' })).toBeDisabled()
    finish({ kind: 'ok', data: { hidden: 0, listed: 0, snapshot: true, already: false } })
    expect(await screen.findByText(/Applied:/)).toBeInTheDocument()
  })
})
