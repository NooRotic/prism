import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { formatUptime } from '../../lib/formatUptime'

interface StreamUptimeProps {
  /** ISO 8601 timestamp from the Helix `stream.started_at` field. */
  startedAt: string
}

// Kept as its own component so the once-a-second tick re-renders only this
// span, not the whole ProfileSidebar tree.
export default function StreamUptime({ startedAt }: StreamUptimeProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start)) return null

  const label = formatUptime(now - start)

  return (
    <div
      className="flex items-center gap-1"
      aria-label={`Live for ${label}`}
      title={`Live for ${label}`}
    >
      <Clock size={12} style={{ color: 'var(--text-muted)' }} />
      <span
        className="text-sm"
        style={{
          color: 'var(--text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {label}
      </span>
    </div>
  )
}
