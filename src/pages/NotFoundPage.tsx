import { Compass } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

/**
 * Shown for any address no route matches. It sits inside the app layout, so the
 * header and the channel rail stay put and a floating video window is not closed
 * by a mistyped address.
 */
export default function NotFoundPage() {
  const { pathname } = useLocation()

  return (
    <div className="flex flex-col items-center gap-4 px-4 pt-16 pb-12 text-center relative">
      <div
        className="p-5 rounded-full"
        style={{ backgroundColor: 'rgba(57, 255, 20, 0.06)', border: '1px solid rgba(57, 255, 20, 0.1)' }}
      >
        <Compass size={44} style={{ color: 'var(--accent-green)' }} strokeWidth={1.5} />
      </div>

      <h1 className="text-display font-heading" style={{ color: 'var(--accent-green)' }}>
        Page not found
      </h1>

      <p className="max-w-lg leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        There is nothing at{' '}
        <code className="break-all" style={{ color: 'var(--text-primary)' }}>
          {pathname}
        </code>
      </p>

      <Link
        to="/"
        className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/5"
        style={{ border: '1px solid var(--accent-green)', color: 'var(--accent-green)' }}
      >
        Back to the PRISM home
      </Link>
    </div>
  )
}
