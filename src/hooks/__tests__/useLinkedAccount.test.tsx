import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useLinkedAccount } from '../useLinkedAccount'
import { removeLink, saveLink } from '../../lib/linkedAccounts'

const rec = (twitch: string) => ({ twitch, youtube: { channelId: 'UCabc', title: 'T' }, confirmed: true, linkedAt: 1 })

beforeEach(() => localStorage.clear())

describe('useLinkedAccount', () => {
  it('is null when the channel has no link', () => {
    const { result } = renderHook(() => useLinkedAccount('mrbeast'))
    expect(result.current).toBeNull()
  })

  it('shows a link as soon as it is saved anywhere on the page, and drops it when removed', () => {
    const { result } = renderHook(() => useLinkedAccount('MrBeast'))
    act(() => saveLink(rec('mrbeast')))
    expect(result.current?.confirmed).toBe(true)
    act(() => removeLink('mrbeast'))
    expect(result.current).toBeNull()
  })

  it('follows a change made in another tab (a storage event)', () => {
    const { result } = renderHook(() => useLinkedAccount('mrbeast'))
    act(() => {
      localStorage.setItem('prism_linked_accounts', JSON.stringify([rec('mrbeast')]))
      window.dispatchEvent(new StorageEvent('storage', { key: 'prism_linked_accounts' }))
    })
    expect(result.current?.twitch).toBe('mrbeast')
  })

  it('reads the link for the channel it is given when that changes', () => {
    saveLink(rec('a'))
    const { result, rerender } = renderHook(({ login }) => useLinkedAccount(login), { initialProps: { login: 'a' } })
    expect(result.current?.twitch).toBe('a')
    rerender({ login: 'b' })
    expect(result.current).toBeNull()
  })
})
