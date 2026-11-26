import { act, renderHook } from '@testing-library/react'
import { fetchTvSettings } from '../../lib/tvSettingsApi'
import { useQrStyle } from '../useQrStyle'

vi.mock('../../lib/tvSettingsApi', () => ({ fetchTvSettings: vi.fn() }))

it('starts with B, takes what the server says, and keeps it when a later ask fails', async () => {
  vi.mocked(fetchTvSettings).mockResolvedValueOnce({ qrStyle: 'a' }).mockResolvedValueOnce(null)
  const { result } = renderHook(() => useQrStyle())
  expect(result.current.style).toBe('b')
  await act(async () => {})
  expect(result.current.style).toBe('a')
  await act(async () => result.current.ask())
  expect(fetchTvSettings).toHaveBeenCalledTimes(2)
  expect(result.current.style).toBe('a')
})
