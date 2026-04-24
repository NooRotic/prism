import { Link } from 'react-router-dom'
import type { ProtocolKey } from '../../config/demoContent'
import { PROTOCOL_META } from '../../config/demoContent'

interface ProtocolCardProps {
  protocol: ProtocolKey
  count: number
}

export function ProtocolCard({ protocol, count }: ProtocolCardProps) {
  const meta = PROTOCOL_META[protocol]
  const route = `/${protocol}`

  return (
    <Link
      to={route}
      className="group block rounded transition-all duration-200 hover:scale-[1.02]"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid var(--border)`,
        borderRadius: '4px',
      }}
    >
      <div className="p-5 flex flex-col gap-3">
        {/* Protocol badge */}
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span
            className="font-heading text-base uppercase tracking-wider group-hover:underline"
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {meta.description}
        </p>

        {/* Count */}
        <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          {count} demo {count === 1 ? 'source' : 'sources'}
        </span>
      </div>
    </Link>
  )
}
