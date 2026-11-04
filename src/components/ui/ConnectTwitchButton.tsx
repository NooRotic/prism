import { LogIn } from 'lucide-react'

interface ConnectTwitchButtonProps {
  onClick: () => void
  /**
   * Stretch to the container width. Used by ProtocolPage's sidebar footer,
   * where the button is the column's call to action rather than an inline
   * control.
   */
  fullWidth?: boolean
}

/**
 * The single "connect twitch" affordance. Every signed-out surface renders
 * this exact button — same gradient, same icon, same lowercase label — so
 * connecting reads as one action rather than five look-alikes.
 */
export default function ConnectTwitchButton({
  onClick,
  fullWidth = false,
}: ConnectTwitchButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 hover:scale-[1.02]${
        fullWidth ? ' w-full' : ''
      }`}
      style={{
        background: 'linear-gradient(135deg, var(--accent-twitch), #7b2ff2)',
        color: '#fff',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        letterSpacing: '0.05em',
      }}
    >
      <LogIn size={12} />
      connect twitch
    </button>
  )
}
