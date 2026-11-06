import VideoPopoutButton from './VideoPopoutButton'

interface FloatingBarProps {
  floating: boolean
  onClick: () => void
}

/**
 * The video control for narrow windows. The chat header, which carries it at md and
 * wider, is hidden below md, so this slim bar sits above the chat and carries it there.
 */
export default function FloatingBar({ floating, onClick }: FloatingBarProps) {
  return (
    <div
      data-testid="floating-bar"
      className="md:hidden flex items-center gap-2 px-2 py-1 text-xs"
      style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}
    >
      {floating && <span>The video is in a floating window</span>}
      <VideoPopoutButton
        floating={floating}
        onClick={onClick}
        className="ml-auto rounded-md p-1 transition-colors hover:bg-white/5"
      />
    </div>
  )
}
