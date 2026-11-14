import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { collectEnvironment } from '../../lib/playbackEnvironment'
import { formatPlaybackReport, redactText, usePlaybackLog, type PlaybackEntry, type PlaybackLevel, type PlaybackSnapshot, type PlaybackStatus } from '../../lib/playbackLog'

/** Colours by status: amber while the first attempt loads, red while retrying or after a failure, green once playing. */
const STATUS_CLASS: Record<Exclude<PlaybackStatus, 'idle'>, string> = {
  starting: 'border-[var(--accent-orange)] text-[var(--accent-orange)]',
  retrying: 'border-[var(--accent-red)] text-[var(--accent-red)]',
  failed: 'border-[var(--accent-red)] text-[var(--accent-red)]',
  playing: 'border-[var(--accent-green)] text-[var(--accent-green)]',
}

const LEVEL: Record<PlaybackLevel, { mark: string; className: string }> = {
  ok: { mark: '✓', className: 'text-[var(--accent-green)]' },
  error: { mark: '✗', className: 'text-[var(--accent-red)]' },
  warn: { mark: '!', className: 'text-[var(--accent-orange)]' },
  info: { mark: '·', className: 'text-[var(--text-secondary)]' },
}

const seconds = (ms: number): string => `+${(ms / 1000).toFixed(1)}s`

function ConsoleLine({ entry }: { entry: PlaybackEntry }) {
  const { mark, className } = LEVEL[entry.level]
  return (
    <li data-level={entry.level} className={`break-all ${className}`}>
      {`${mark} ${seconds(entry.at)} ${entry.source}: ${redactText(entry.message)}`}
    </li>
  )
}

/** The page the report was made on, without its query: a pasted stream address lives there. */
const pageAddress = (): string => (typeof window === 'undefined' ? '' : `${window.location.origin}${window.location.pathname}`)

function VerboseOutput({ snapshot, id }: { snapshot: PlaybackSnapshot; id: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const report = useMemo(() => formatPlaybackReport(snapshot, { environment: collectEnvironment(), page: pageAddress() }), [snapshot])

  const copyReport = async () => {
    let next: 'copied' | 'failed' = 'copied'
    try {
      await navigator.clipboard.writeText(report)
    } catch {
      next = 'failed'
    }
    setCopy(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopy('idle'), 2000)
  }

  return (
    <div id={id} className="mt-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Debug output
        </span>
        <button
          type="button"
          onClick={() => void copyReport()}
          className="cursor-pointer rounded border px-2 py-0.5 text-xs hover:bg-[var(--bg-card-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent-green)]"
          style={{ borderColor: 'var(--border-accent)', color: 'var(--text-secondary)' }}
        >
          {copy === 'copied' ? 'Copied' : copy === 'failed' ? 'Could not copy' : 'Copy report'}
        </button>
      </div>
      <pre
        aria-label="Playback debug output"
        tabIndex={0}
        className="m-0 max-h-72 overflow-auto rounded p-2 font-mono text-[11px] leading-snug break-all whitespace-pre-wrap"
        style={{ background: 'var(--bg)', color: 'var(--text-secondary)' }}
      >
        {report}
      </pre>
    </div>
  )
}

/**
 * What the player is doing, in the open: a PLAYBACK button (amber while the first attempt loads, red while retrying or
 * after a failure, green once playing) with the attempt number, a "Console output" field with the last two log lines
 * (pass or fail), and, while playback is failing or being retried (or whenever the button is pressed), the whole report with a
 * Copy button. It shows nothing while no HLS or DASH stream is playing.
 */
export default function PlaybackDebug() {
  const snapshot = usePlaybackLog()
  const panelId = useId()
  // The reader's own choice: null until they press the button, and forgotten when the next stream starts.
  const [choice, setChoice] = useState<boolean | null>(null)
  const [choiceSession, setChoiceSession] = useState(snapshot.session)
  if (snapshot.session !== choiceSession) {
    setChoiceSession(snapshot.session)
    setChoice(null)
  }

  if (snapshot.status === 'idle') return null

  const open = choice ?? (snapshot.status === 'retrying' || snapshot.status === 'failed')
  const attempt = snapshot.attempts > 1 ? ` · attempt ${snapshot.attempts}` : ''

  return (
    <section aria-label="Playback status" className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <button
        type="button"
        data-status={snapshot.status}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setChoice(!open)}
        className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded border px-3 py-1.5 text-left font-mono text-xs font-semibold tracking-wider focus-visible:outline-2 focus-visible:outline-[var(--accent-green)] ${STATUS_CLASS[snapshot.status]}`}
        style={{ background: 'var(--bg)' }}
      >
        <span>PLAYBACK</span>{' '}
        <span className="font-normal">{`${snapshot.status}${attempt}`}</span>
      </button>

      <div className="mt-2">
        <div className="text-xs" style={{ color: 'var(--text-muted)' }} id={`${panelId}-console`}>
          Console output
        </div>
        <ul aria-labelledby={`${panelId}-console`} className="m-0 mt-1 flex list-none flex-col gap-0.5 p-0 font-mono text-[11px]">
          {snapshot.entries.slice(-2).map((entry, index) => (
            <ConsoleLine key={`${snapshot.entries.length}-${index}`} entry={entry} />
          ))}
        </ul>
      </div>

      {open && <VerboseOutput snapshot={snapshot} id={panelId} />}
    </section>
  )
}
