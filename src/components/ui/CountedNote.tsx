import { COUNTED_NOTE, UNCOUNTED_NOTE } from '../../config/analytics'
import { SEND_VISITS } from '../../config/historyServer'

/**
 * The one plain line about what is counted. Both versions are in the page for everyone and CSS shows one of them
 * (`.counted-note`, `.uncounted-note` in index.css): the first only where the counting block in index.html ran, which adds the class
 * "counted" to <html>; the second where it did not. A development build counts nothing, so it does not say it does.
 */
export function CountedNote({ className = 'text-sm max-w-md text-center text-[var(--text-muted)]' }: { className?: string }) {
  return (
    <>
      <p className={`counted-note ${className}`} style={{ fontWeight: 300 }}>
        {COUNTED_NOTE}
      </p>
      {SEND_VISITS && (
        <p className={`uncounted-note ${className}`} style={{ fontWeight: 300 }}>
          {UNCOUNTED_NOTE}
        </p>
      )}
    </>
  )
}
