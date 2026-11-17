import { COUNTED_NOTE } from '../../config/analytics'

/**
 * The one plain line about what is counted. It is in the page for everyone but hidden by CSS (`.counted-note` in index.css)
 * unless the counting block in index.html ran, which adds the class "counted" to <html>: it shows only where a visit is counted.
 */
export function CountedNote() {
  return (
    <p
      className="counted-note text-sm max-w-md text-center"
      style={{ color: 'var(--text-muted)', fontWeight: 300 }}
    >
      {COUNTED_NOTE}
    </p>
  )
}
