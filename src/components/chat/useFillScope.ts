import { useLayoutEffect } from 'react'
import { FILL_ATTRIBUTE } from './fillMode'
import type { FillScope } from './fillMode'

/**
 * Puts the fill attribute on the page root while `scope` is non-null, which is what hides the
 * header, rail and the other `fill-hide` chrome (see index.css). It is removed when the scope goes
 * null or the component unmounts, so no other page is ever affected.
 */
export function useFillScope(scope: FillScope | null): void {
  useLayoutEffect(() => {
    if (!scope) return
    const root = document.documentElement
    root.setAttribute(FILL_ATTRIBUTE, scope)
    return () => root.removeAttribute(FILL_ATTRIBUTE)
  }, [scope])
}
