import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { contextSearch, type ContextItem, type ContextWindow, type VideoContextSource } from '../../lib/videoContext'

interface Props {
  source: VideoContextSource
  status: 'none' | 'loading' | 'ready' | 'unreadable'
  strip: ContextWindow | null
  currentId: string
}

const stepClass = 'shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full'
const stepStyle = (enabled: boolean) => ({
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border)',
  color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
  opacity: enabled ? 1 : 0.5,
})

/** The queue or playlist as a full-width filmstrip under the player: position, previous / next, what is behind and ahead. */
export default function ContextStrip({ source, status, strip, currentId }: Props) {
  const currentRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  // Centre the current video in the strip, so what is behind and ahead are both in view. Scrolls the strip only,
  // never the page (scrollIntoView would move both).
  useEffect(() => {
    const scroller = scrollerRef.current
    const current = currentRef.current
    if (!scroller || !current) return
    scroller.scrollLeft = Math.max(0, current.offsetLeft - scroller.clientWidth / 2 + current.offsetWidth / 2)
  }, [currentId, strip])

  if (status === 'none' || !source) return null
  if (status === 'unreadable') {
    return (
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Can't read this playlist
      </p>
    )
  }
  if (status === 'loading') return <div className="h-24" aria-hidden="true" />
  if (!strip) return null

  const search = contextSearch(source)
  const href = (item: ContextItem) => `/youtube/${item.id}${search}`
  const label = `${strip.index + 1} of ${strip.total} · ${source.kind === 'catchup' ? 'Import from YT' : 'Playlist'}`
  const thumb = (item: ContextItem) => (
    <>
      <div className="aspect-video w-32 md:w-40 rounded overflow-hidden" style={{ backgroundColor: '#000' }}>
        {item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />}
      </div>
      <span className="text-xs md:text-sm line-clamp-2 leading-snug" style={{ color: 'var(--text-primary)' }}>
        {item.title}
      </span>
    </>
  )

  return (
    <nav aria-label="Playlist position" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {strip.prev ? (
          <Link to={href(strip.prev)} aria-label="Previous video" className={stepClass} style={stepStyle(true)}>
            <ChevronLeft size={18} />
          </Link>
        ) : (
          <span aria-disabled="true" className={stepClass} style={stepStyle(false)}>
            <ChevronLeft size={18} />
            <span className="sr-only">Previous video</span>
          </span>
        )}
        <span className="text-sm font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          {label}
        </span>
        {strip.next ? (
          <Link to={href(strip.next)} aria-label="Next video" className={stepClass} style={stepStyle(true)}>
            <ChevronRight size={18} />
          </Link>
        ) : (
          <span aria-disabled="true" className={stepClass} style={stepStyle(false)}>
            <ChevronRight size={18} />
            <span className="sr-only">Next video</span>
          </span>
        )}
      </div>
      <div ref={scrollerRef} className="relative flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {strip.before.map((item) => (
          <Link key={item.id} to={href(item)} className="shrink-0 w-32 md:w-40 flex flex-col gap-1 opacity-80 hover:opacity-100">
            {thumb(item)}
          </Link>
        ))}
        <div
          ref={currentRef}
          aria-current="true"
          aria-label={`Now playing: ${strip.current.title}`}
          className="shrink-0 w-32 md:w-40 flex flex-col gap-1 rounded p-0.5"
          style={{ outline: '2px solid var(--accent-youtube)' }}
        >
          {thumb(strip.current)}
        </div>
        {strip.after.map((item) => (
          <Link key={item.id} to={href(item)} className="shrink-0 w-32 md:w-40 flex flex-col gap-1 hover:opacity-100">
            {thumb(item)}
          </Link>
        ))}
      </div>
    </nav>
  )
}
