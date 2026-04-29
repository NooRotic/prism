import { Flame, Bot, Code, Gamepad2, Music, Monitor, RefreshCw } from 'lucide-react'
import { YOUTUBE_CATEGORIES } from '../../config/youtubeCategories'
import { ExpandablePill } from '../ui/ExpandablePill'

export interface YouTubeCategoryBarProps {
  activeId: string
  onSelect: (categoryId: string) => void
  onRefresh: (categoryId: string) => void
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'flame': <Flame size={14} />,
  'bot': <Bot size={14} />,
  'code': <Code size={14} />,
  'gamepad-2': <Gamepad2 size={14} />,
  'music': <Music size={14} />,
  'monitor': <Monitor size={14} />,
}

export function YouTubeCategoryBar({ activeId, onSelect, onRefresh }: YouTubeCategoryBarProps) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {YOUTUBE_CATEGORIES.map((cat) => (
        <div key={cat.id} className="flex items-center gap-1">
          <ExpandablePill
            label={cat.label}
            description={cat.description}
            icon={ICON_MAP[cat.icon]}
            active={cat.id === activeId}
            accentColor="var(--accent-youtube)"
            onClick={() => onSelect(cat.id)}
          />
          {cat.id === activeId && (
            <button
              onClick={() => onRefresh(cat.id)}
              aria-label="Refresh category"
              className="p-1 rounded-full cursor-pointer transition-colors duration-200"
              style={{
                color: 'var(--text-muted)',
                background: 'none',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
