import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { probeStream, type ProbeResult } from '../../lib/streamProbe'
import type { StreamKind } from '../../lib/urlDetection'

const KIND_LABEL: Record<StreamKind, string> = { hls: 'HLS', dash: 'DASH', mp4: 'MP4' }
const ALL_KINDS: StreamKind[] = ['hls', 'dash', 'mp4']

/**
 * Asks the pasted address what is wrong with it. The result is tied to the address it was
 * asked about, so a late answer for an address that has since been replaced is never shown.
 */
function useStreamProbe(url: string, kind: StreamKind): ProbeResult | null {
  const key = `${kind}|${url}`
  const [answer, setAnswer] = useState<{ key: string; result: ProbeResult } | null>(null)

  useEffect(() => {
    let cancelled = false
    probeStream(url, kind).then((result) => {
      if (!cancelled) setAnswer({ key, result })
    })
    return () => {
      cancelled = true
    }
  }, [url, kind, key])

  return answer && answer.key === key ? answer.result : null
}

function explain(result: ProbeResult, kind: StreamKind): string {
  switch (result.kind) {
    case 'ok':
      return `The address answers and looks like a ${KIND_LABEL[kind]} stream, but the player could not use it. The video format may not be supported in this browser, or the stream's media files may be blocked.`
    case 'http':
      return `The server answered ${result.status}. The address may be wrong, expired, or need a sign-in.`
    case 'not-playlist':
      return `This address returned something that is not ${kind === 'dash' ? 'a DASH manifest' : 'an HLS playlist'}, probably a web page.`
    case 'unreachable':
      return 'The browser could not fetch this address. The server may be down, or it does not allow other sites (CORS) to read it. A link that plays in VLC can still fail here.'
    case 'mixed-content':
      return 'This address starts with http://, but PRISM is served over https, so the browser blocks it. Try the https:// version if the server has one.'
  }
}

interface StatusProps {
  url: string
  kind: StreamKind
  /** True when the type is only our first guess, so the other types are worth offering. */
  guessedKind: boolean
  onRetry: () => void
  onTryAs: (kind: StreamKind) => void
}

function Diagnosis({ url, kind }: { url: string; kind: StreamKind }) {
  const result = useStreamProbe(url, kind)
  if (!result) {
    return (
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Checking the address...
      </p>
    )
  }
  return (
    <p
      data-testid="probe-explanation"
      data-probe-result={result.kind}
      className="text-sm max-w-xl"
      style={{ color: 'var(--text-secondary)' }}
    >
      {explain(result, kind)}
    </p>
  )
}

const BUTTON_STYLE = {
  border: '1px solid var(--border-accent)',
  color: 'var(--text-secondary)',
} as const

function Actions({ url, kind, guessedKind, onRetry, onTryAs }: StatusProps) {
  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(url)
    } catch {
      // No clipboard, or the browser refused it: nothing useful to tell the visitor.
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 rounded text-sm font-semibold cursor-pointer"
        style={{ backgroundColor: 'var(--accent-green)', color: 'var(--bg)' }}
      >
        Retry
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm hover:bg-white/10"
        style={BUTTON_STYLE}
      >
        <ExternalLink size={14} />
        Open address
      </a>
      <button
        type="button"
        onClick={copy}
        className="px-3 py-1.5 rounded text-sm cursor-pointer hover:bg-white/10"
        style={BUTTON_STYLE}
      >
        Copy address
      </button>
      {guessedKind &&
        ALL_KINDS.filter((k) => k !== kind).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onTryAs(k)}
            className="px-3 py-1.5 rounded text-sm cursor-pointer hover:bg-white/10"
            style={BUTTON_STYLE}
          >
            Try as {KIND_LABEL[k]}
          </button>
        ))}
    </div>
  )
}

/** Fills the player frame when no engine could play the stream. */
export function StreamErrorCard(props: StatusProps & { playerError: string | null }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center w-full h-full gap-4 p-6 text-center"
      style={{ minHeight: 300, backgroundColor: 'var(--bg-card)' }}
    >
      <AlertTriangle size={36} style={{ color: 'var(--accent-orange)' }} />
      <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
        Can&apos;t play this stream
      </h3>
      <Diagnosis url={props.url} kind={props.kind} />
      {props.playerError && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Player said: {props.playerError}
        </p>
      )}
      <Actions {...props} />
    </div>
  )
}

/** Sits under the player while a stream is slow to start; the player keeps loading. */
export function StreamStallNotice(props: StatusProps) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-3 p-4 rounded-lg text-center"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        Still loading after 12 s. The stream may be slow or unreachable.
      </p>
      <Diagnosis url={props.url} kind={props.kind} />
      <Actions {...props} />
    </div>
  )
}
