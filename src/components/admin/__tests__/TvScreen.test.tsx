import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TvScreen from '../TvScreen'
import { AdminSessionContext } from '../AdminSessionContext'

const api = vi.hoisted(() => ({ setTvQrStyle: vi.fn(), fetchTvSettings: vi.fn(), loadStreamSnapshot: vi.fn() }))
vi.mock('../../../lib/adminApi', () => ({ setTvQrStyle: api.setTvQrStyle }))
vi.mock('../../../lib/tvSettingsApi', () => ({ fetchTvSettings: api.fetchTvSettings }))
vi.mock('../../../lib/streamsApi', () => ({ loadStreamSnapshot: api.loadStreamSnapshot }))

const LIMITS = { ttDayBudget: 1500, ttRunBudget: 300, newPerDay: 200, tailDays: 30 }
const onExpired = vi.fn()
const style = (letter: string) => screen.getByRole('region', { name: `Style ${letter}` })

function renderScreen() {
  return render(
    <AdminSessionContext.Provider value={{ limits: LIMITS, onExpired }}>
      <TvScreen />
    </AdminSessionContext.Provider>,
  )
}

describe('TvScreen', () => {
  beforeEach(() => {
    api.setTvQrStyle.mockReset()
    api.fetchTvSettings.mockReset().mockResolvedValue({ qrStyle: 'b' })
    api.loadStreamSnapshot.mockReset().mockResolvedValue({ kind: 'ready', snapshot: { generated: '', defaultId: 'abc123def456', groups: [], streams: [] } })
    onExpired.mockReset()
  })

  it('shows the three styles and which one the TV uses', async () => {
    renderScreen()
    expect(await within(style('B')).findByText('In use')).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'QR code' })).toHaveLength(3)
    expect(within(style('A')).queryByText('In use')).toBeNull()
    expect(screen.getByText('The TV uses the new style the next time its code is shown.')).toBeInTheDocument()
  })

  it('choosing one tells the server and shows its answer', async () => {
    api.setTvQrStyle.mockResolvedValue({ kind: 'ok', data: { qrStyle: 'a' } })
    renderScreen()
    await within(style('B')).findByText('In use')
    await userEvent.click(within(style('A')).getByRole('button', { name: 'Use this style' }))
    expect(api.setTvQrStyle).toHaveBeenCalledWith('a')
    expect(await within(style('A')).findByText('In use')).toBeInTheDocument()
    expect(within(style('B')).queryByText('In use')).toBeNull()
  })

  it('says so when the server cannot be reached, and still lets the owner choose', async () => {
    api.fetchTvSettings.mockResolvedValue(null)
    api.setTvQrStyle.mockResolvedValue({ kind: 'ok', data: { qrStyle: 'c' } })
    renderScreen()
    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'QR code' })).toHaveLength(3)
    await userEvent.click(within(style('C')).getByRole('button', { name: 'Use this style' }))
    expect(api.setTvQrStyle).toHaveBeenCalledWith('c')
    expect(await within(style('C')).findByText('In use')).toBeInTheDocument()
  })

  it('a refused change says so, and an expired sign-in signs out', async () => {
    api.setTvQrStyle.mockResolvedValueOnce({ kind: 'unavailable' }).mockResolvedValueOnce({ kind: 'signed_out' })
    renderScreen()
    await within(style('B')).findByText('In use')
    await userEvent.click(within(style('A')).getByRole('button', { name: 'Use this style' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not change the style')
    expect(within(style('B')).getByText('In use')).toBeInTheDocument()
    await userEvent.click(within(style('A')).getByRole('button', { name: 'Use this style' }))
    expect(onExpired).toHaveBeenCalled()
  })
})
