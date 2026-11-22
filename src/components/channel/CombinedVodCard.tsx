import { Link } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { detectURLType } from '../../lib/urlDetection'
import type { CombinedItem } from '../../lib/combinedVods'

const PLATFORM = {
  twitch: { label: 'Twitch', color: 'var(--accent-twitch)' },
  youtube: { label: 'YouTube', color: 'var(--accent-youtube)' },
} as const

function formatDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDuration(sec: number | null): string {
  if (sec === null) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${sec}s`
}

function Body({ item }: { item: CombinedItem }) {
  const p = PLATFORM[item.platform]
  const meta = [formatDate(item.publishedAt), item.viewCount !== undefined && item.viewCount !== '' ? `${Number(item.viewCount).toLocaleString()} views` : '', formatDuration(item.durationSec)].filter(Boolean)
  return (
    <>
      <div className="relative aspect-video w-full" style={{ backgroundColor: 'var(--bg)' }}>
        {item.thumbnail && <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />}
        <span className="absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ backgroundColor: p.color, color: '#fff' }}>
          {p.label}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-1">
        <span data-testid="combined-title" className="text-sm font-medium line-clamp-2" style={{ color: 'var(--text-primary)' }}>
          {item.title}
        </span>
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <Eye size={11} />
          {meta.join(' · ')}
        </span>
        {item.alsoOn && (
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            Also on {PLATFORM[item.alsoOn].label}
          </span>
        )}
      </div>
    </>
  )
}

const cardClass = 'group flex flex-col rounded-lg overflow-hidden text-left transition-all duration-200 cursor-pointer'
/** A thin line in the card's platform colour (purple Twitch, red YouTube), so the two kinds read apart at a glance. */
const cardStyle = (platform: CombinedItem['platform']) => ({ backgroundColor: 'var(--bg-card)', border: `1px solid ${PLATFORM[platform].color}` })

/** One card for either platform. A YouTube video opens PRISM's YouTube page; a Twitch VOD plays in this page's player. */
export default function CombinedVodCard({ item }: { item: CombinedItem }) {
  const { dispatch } = useApp()
  if (item.platform === 'youtube') {
    return (
      <Link to={item.url ?? `/youtube/${item.id}`} className={cardClass} style={cardStyle('youtube')}>
        <Body item={item} />
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        if (!item.url) return
        dispatch({ type: 'PLAY_URL', url: item.url, detection: detectURLType(item.url) })
      }}
      className={cardClass}
      style={cardStyle('twitch')}
    >
      <Body item={item} />
    </button>
  )
}
