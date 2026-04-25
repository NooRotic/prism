import { useNavigate } from 'react-router-dom'
import type { DemoEntry } from '../../config/demoContent'
import { PROTOCOL_META } from '../../config/demoContent'

const PROTOCOL_ROUTE: Record<string, string> = {
  twitch: '/twitch',
  youtube: '/youtube',
  hls: '/hls-dash',
  dash: '/hls-dash',
}

function getRoute(entry: DemoEntry): string {
  const base = PROTOCOL_ROUTE[entry.protocol] ?? '/hls-dash'
  if (entry.protocol === 'twitch') return `${base}/${entry.url}`
  return `${base}/${entry.id}`
}

function getAccent(protocol: string): string {
  if (protocol === 'twitch') return PROTOCOL_META.twitch.color
  if (protocol === 'youtube') return PROTOCOL_META.youtube.color
  return PROTOCOL_META['hls-dash'].color
}

export function DemoCard({ entry }: { entry: DemoEntry }) {
  const navigate = useNavigate()
  const accent = getAccent(entry.protocol)

  return (
    <button
      type="button"
      onClick={() => navigate(getRoute(entry))}
      className="group text-left w-full rounded transition-all duration-200 hover:scale-[1.02] cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: `1px solid var(--border)`,
        borderRadius: '4px',
      }}
    >
      {/* Thumbnail area */}
      <div
        className="w-full aspect-video rounded-t flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderBottom: `1px solid var(--border)`,
          borderRadius: '4px 4px 0 0',
        }}
      >
        <span
          className="text-xs font-mono uppercase tracking-widest opacity-60 group-hover:opacity-90 transition-opacity"
          style={{ color: accent }}
        >
          {entry.protocol}
        </span>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1">
        <span
          className="text-sm font-medium truncate group-hover:underline"
          style={{ color: 'var(--text-primary)' }}
        >
          {entry.label}
        </span>
        {entry.description && (
          <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {entry.description}
          </span>
        )}
        <span
          className="text-[10px] font-mono uppercase tracking-wider mt-1"
          style={{ color: accent, opacity: 0.85 }}
        >
          {entry.protocol === 'hls' ? 'HLS' : entry.protocol === 'dash' ? 'DASH' : entry.protocol}
        </span>
      </div>
    </button>
  )
}
