import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Smile, Shield } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'

export default function EmoteBadgeDisplay() {
  const { state } = useApp()
  const { emotes, badges } = state.channel
  const [expanded, setExpanded] = useState(false)

  const tierSummary = useMemo(() => {
    const tiers = new Set<string>()
    for (const emote of emotes) {
      if (emote.tier) tiers.add(emote.tier)
    }
    return tiers.size
  }, [emotes])

  if (emotes.length === 0 && badges.length === 0) return null

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border)',
      }}
    >
      {/* Header + toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <Smile size={14} style={{ color: 'var(--accent-green)' }} />
          <span
            className="text-sm font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            Emotes & Badges
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {emotes.length} custom emotes across {tierSummary} tier{tierSummary !== 1 ? 's' : ''}
          </span>
          {expanded ? (
            <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
          )}
        </div>
      </button>

      {expanded && (
        <>
          {/* Emotes row */}
          {emotes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Smile size={12} style={{ color: 'var(--accent-twitch)' }} />
                <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color: 'var(--accent-twitch)' }}>
                  Emotes ({emotes.length})
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                {emotes.map((emote) => (
                  <img
                    key={emote.id}
                    src={emote.images.url_2x}
                    alt={emote.name}
                    title={emote.name}
                    className="w-8 h-8 shrink-0 rounded"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Badges row */}
          {badges.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Shield size={12} style={{ color: 'var(--accent-twitch)' }} />
                <span className="text-[11px] uppercase tracking-wider font-bold" style={{ color: 'var(--accent-twitch)' }}>
                  Badge Sets ({badges.length})
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin">
                {badges.map((badge) =>
                  badge.versions.map((version) => (
                    <img
                      key={`${badge.set_id}-${version.id}`}
                      src={version.image_url_2x}
                      alt={version.title}
                      title={`${version.title} - ${version.description}`}
                      className="w-8 h-8 shrink-0 rounded"
                      loading="lazy"
                    />
                  )),
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
