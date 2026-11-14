import { VolumeX } from 'lucide-react'
import { usePlaybackLog } from '../../lib/playbackLog'

interface SoundNoticeProps {
  /** Turns the sound on. It runs from the button, so the browser counts it as the visitor's own click. */
  onTurnOn: () => void
}

/**
 * Shown while the video plays muted only because the browser would not start it with sound (browsers allow that once the
 * visitor has used the page): it says so, and offers the one click that turns the sound on.
 */
export default function SoundNotice({ onTurnOn }: SoundNoticeProps) {
  const { soundBlocked } = usePlaybackLog()
  if (!soundBlocked) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-[0.95rem]"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--accent-orange)', color: 'var(--text-primary)' }}
    >
      <span className="flex min-w-0 items-center gap-2">
        <VolumeX size={18} aria-hidden="true" className="shrink-0" style={{ color: 'var(--accent-orange)' }} />
        <span>
          <strong>Playing muted.</strong> Your browser does not allow sound until you click the page.
        </span>
      </span>
      <button
        type="button"
        onClick={onTurnOn}
        className="cursor-pointer rounded-md px-3 py-1 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-green)]"
        style={{ background: 'var(--accent-green)', color: '#000' }}
      >
        Turn sound on
      </button>
    </div>
  )
}
