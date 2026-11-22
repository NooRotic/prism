import { useEffect, useRef, useState, type RefObject } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus for a modal dialog: focus moves inside when it opens (unless an `autoFocus` field already took it), Tab and
 * Shift+Tab cycle inside it, Esc closes it wherever focus is, and focus returns to whatever had it before (the button
 * that opened it) when it closes.
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  // Read during the first render, before React applies autoFocus inside the dialog, so this is the opener.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const box = ref.current
    if (!box) return
    const focusables = () => Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!box.contains(document.activeElement)) focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      // Esc while an input method is composing text cancels the composition, not the dialog.
      if (e.isComposing) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !box.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !box.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [ref, opener])
}
