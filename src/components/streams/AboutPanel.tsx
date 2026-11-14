import { useEffect, useRef } from 'react'
import { Info, Pin, PinOff, X } from 'lucide-react'
import { useAutoFold } from '../../hooks/useAutoFold'
import { regionName } from '../../lib/countries'
import { usePlaybackLog } from '../../lib/playbackLog'
import type { StreamEntry } from '../../lib/streamsApi'
import ChannelPicture from './ChannelPicture'
import CountryFlag from './CountryFlag'
import PlaybackDebug from './PlaybackDebug'

interface AboutPanelProps {
  stream: StreamEntry | null
  /** The snapshot's group names; the stream's `groups` index into this list. */
  groups: string[]
}

const STATE_TEXT: Record<StreamEntry['state'], string> = {
  new: 'Not checked yet',
  working: 'Working',
  suspect: 'May not play reliably',
}

/** The host of a stream's address, or null. Only the host is ever shown: the full address can carry a token. */
function sourceHost(url: string): string | null {
  try {
    return new URL(url).host || null
  } catch {
    return null
  }
}

/**
 * "About this stream": opens each time a stream starts, folds into a slim tab after thirty seconds (hovering, clicking
 * or focusing inside it starts the thirty seconds again, and a pin keeps it open), and never takes keyboard focus. Names
 * and groups are text. The movement is skipped for a visitor who asked their system for less of it.
 */
export default function AboutPanel({ stream, groups }: AboutPanelProps) {
  // While playback is failing or being retried the panel stays open (and opens if folded): it holds the debug output.
  const playback = usePlaybackLog()
  const failing = playback.status === 'retrying' || playback.status === 'failed'
  const { open, pinned, bump, reopen, close, togglePin } = useAutoFold(stream?.id ?? '', 30_000, failing)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Escape closes the open panel, like the X. It stands aside while the visitor types in a field, when a modifier key is
  // held (those are the browser's and the page's own shortcuts), and when something else already took the key.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  useEffect(() => {
    const el = panelRef.current
    if (!open || !el || typeof el.animate !== 'function') return
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    el.animate(
      [
        { opacity: 0, transform: 'translateX(12px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 200, easing: 'ease-out' },
    )
  }, [open, stream?.id])

  const host = stream ? sourceHost(stream.url) : null
  const groupNames = stream ? stream.groups.map((index) => groups[index]).filter((name): name is string => Boolean(name)) : []

  return (
    <aside
      aria-label="About this stream"
      onMouseEnter={bump}
      onClick={bump}
      onFocusCapture={bump}
      className={open ? 'w-full lg:w-[22rem]' : 'w-full lg:w-14'}
    >
      {open ? (
        <div
          ref={panelRef}
          className="rounded-xl border p-4"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
              About this stream
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={togglePin}
                aria-pressed={pinned}
                aria-label={pinned ? 'Let this panel fold away' : 'Keep this panel open'}
                className="cursor-pointer rounded p-1 hover:bg-[var(--bg-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
                style={{ color: pinned ? 'var(--accent-green)' : 'var(--text-secondary)' }}
              >
                {pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close this panel"
                title="Close"
                className="cursor-pointer rounded p-1 hover:bg-[var(--bg-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </span>
          </div>

          {stream === null ? (
            <p style={{ color: 'var(--text-secondary)' }}>Choose a stream from the list to see its details.</p>
          ) : (
            <>
              <div className="flex items-start gap-4">
                <ChannelPicture stream={stream} size={96} />
                <div className="min-w-0">
                  <h2 className="leading-tight font-semibold break-words" style={{ fontSize: '1.4em' }}>
                    {stream.name}
                  </h2>
                  {stream.country !== null && (
                    <p className="mt-1.5 flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <CountryFlag code={stream.country} size={24} />
                      <span>{regionName(stream.country)}</span>
                    </p>
                  )}
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 text-[1.05em]">
                {groupNames.length > 0 && (
                  <div>
                    <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Groups
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {groupNames.map((name) => (
                        <span key={name} className="rounded px-2 py-0.5 text-[0.9em]" style={{ background: 'var(--border-accent)' }}>
                          {name}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Type
                  </dt>
                  <dd>{stream.kind === 'dash' ? 'DASH stream' : 'HLS stream'}</dd>
                </div>
                {host !== null && (
                  <div>
                    <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Source
                    </dt>
                    <dd className="break-all">{host}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Status
                  </dt>
                  <dd>{STATE_TEXT[stream.state]}</dd>
                </div>
              </dl>

              <PlaybackDebug />
            </>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={reopen}
          aria-label="About this stream"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--text-muted)] bg-[var(--bg-card-hover)] px-2 py-2.5 text-[var(--text-primary)] hover:border-[var(--accent-green)] focus-visible:outline-2 focus-visible:outline-[var(--accent-green)] lg:h-48 lg:flex-col"
        >
          <Info size={22} aria-hidden="true" />
          <span className="text-base font-medium lg:[writing-mode:vertical-rl]" aria-hidden="true">
            About this stream
          </span>
        </button>
      )}
    </aside>
  )
}
