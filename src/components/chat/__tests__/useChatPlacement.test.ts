import { renderHook, act } from '@testing-library/react'
import { vi } from 'vitest'
import { DEFAULT_PLACEMENT, parsePlacement } from '../chatPlacement'
import { useChatPlacement } from '../useChatPlacement'
import { STORAGE_KEYS } from '../../../config/storageKeys'

const KEY = STORAGE_KEYS.LOCAL_CHAT_PLACEMENT
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null')

describe('useChatPlacement', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to docked right and visible when nothing is stored', () => {
    const { result } = renderHook(() => useChatPlacement())
    expect(result.current.placement).toEqual({ side: 'right', hidden: false })
  })

  it('reads a stored placement', () => {
    localStorage.setItem(KEY, JSON.stringify({ side: 'left', hidden: true }))
    const { result } = renderHook(() => useChatPlacement())
    expect(result.current.placement).toEqual({ side: 'left', hidden: true })
  })

  it('hide and show persist the hidden flag and keep the side', () => {
    const { result } = renderHook(() => useChatPlacement())

    act(() => result.current.hide())
    expect(result.current.placement).toEqual({ side: 'right', hidden: true })
    expect(stored()).toEqual({ side: 'right', hidden: true })

    act(() => result.current.show())
    expect(result.current.placement).toEqual({ side: 'right', hidden: false })
    expect(stored()).toEqual({ side: 'right', hidden: false })
  })

  it('swapSide and setSide persist the side and keep the hidden flag', () => {
    const { result } = renderHook(() => useChatPlacement())

    act(() => result.current.hide())
    act(() => result.current.swapSide())
    expect(result.current.placement).toEqual({ side: 'left', hidden: true })
    expect(stored()).toEqual({ side: 'left', hidden: true })

    act(() => result.current.setSide('right'))
    expect(result.current.placement).toEqual({ side: 'right', hidden: true })
    expect(stored()).toEqual({ side: 'right', hidden: true })
  })

  it('survives a reload', () => {
    const first = renderHook(() => useChatPlacement())
    act(() => first.result.current.swapSide())
    first.unmount()

    const second = renderHook(() => useChatPlacement())
    expect(second.result.current.placement.side).toBe('left')
  })

  it('still changes for the session when localStorage.setItem throws', () => {
    const { result } = renderHook(() => useChatPlacement())
    const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })

    act(() => {
      expect(() => result.current.hide()).not.toThrow()
    })
    expect(result.current.placement.hidden).toBe(true)

    spy.mockRestore()
  })
})

describe('parsePlacement', () => {
  it.each([
    ['nothing stored', null],
    ['invalid JSON', '{'],
    ['the JSON null', 'null'],
    ['a JSON array', '[]'],
    ['an unknown side', '{"side":"top","hidden":false}'],
    ['a non-boolean hidden', '{"side":"left","hidden":"yes"}'],
    ['a missing hidden', '{"side":"left"}'],
  ])('falls back to the default for %s', (_label, raw) => {
    expect(parsePlacement(raw)).toEqual(DEFAULT_PLACEMENT)
  })

  it('accepts a valid placement', () => {
    expect(parsePlacement('{"side":"left","hidden":true}')).toEqual({ side: 'left', hidden: true })
  })
})
