import { Lock } from 'lucide-react'
import ConnectTwitchButton from './ConnectTwitchButton'

interface ConnectTwitchPromptProps {
  /** What this surface would have shown, had the user been connected. */
  title: string
  /** One line naming what connecting unlocks here. */
  description: string
  onConnect: () => void
  /** Layout hook for the call site's container. */
  className?: string
}

/**
 * Explains an absence. Rendered where Twitch data would be, when there is no
 * token to fetch it with.
 *
 * It asserts nothing about the user's channels — that distinction is load
 * bearing. Showing placeholder or demo data dressed as real follows is the
 * defect this component exists to avoid repeating.
 */
export default function ConnectTwitchPrompt({
  title,
  description,
  onConnect,
  className = '',
}: ConnectTwitchPromptProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${className}`}
    >
      <Lock size={24} style={{ color: 'var(--accent-twitch)' }} />
      <span
        className="text-sm font-medium"
        style={{ color: 'var(--accent-twitch)' }}
      >
        {title}
      </span>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
      <div className="mt-1">
        <ConnectTwitchButton onClick={onConnect} />
      </div>
    </div>
  )
}
