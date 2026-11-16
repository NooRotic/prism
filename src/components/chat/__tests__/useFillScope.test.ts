import { renderHook } from '@testing-library/react'
import { FILL_ATTRIBUTE } from '../fillMode'
import type { FillScope } from '../fillMode'
import { useFillScope } from '../useFillScope'

const attr = () => document.documentElement.getAttribute(FILL_ATTRIBUTE)

describe('useFillScope', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(FILL_ATTRIBUTE)
  })

  it('sets data-fill while a scope is given', () => {
    renderHook(() => useFillScope('all'))
    expect(attr()).toBe('all')
  })

  it('follows the scope from md to all', () => {
    const { rerender } = renderHook(({ scope }: { scope: FillScope | null }) => useFillScope(scope), {
      initialProps: { scope: 'md' as FillScope | null },
    })
    expect(attr()).toBe('md')
    rerender({ scope: 'all' })
    expect(attr()).toBe('all')
  })

  it('removes it when the scope becomes null', () => {
    const { rerender } = renderHook(({ scope }: { scope: FillScope | null }) => useFillScope(scope), {
      initialProps: { scope: 'all' as FillScope | null },
    })
    rerender({ scope: null })
    expect(attr()).toBeNull()
  })

  it('removes it on unmount', () => {
    const { unmount } = renderHook(() => useFillScope('md'))
    unmount()
    expect(attr()).toBeNull()
  })

  it('does nothing while the scope is null', () => {
    renderHook(() => useFillScope(null))
    expect(attr()).toBeNull()
  })
})
