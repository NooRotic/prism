import ConnectTwitchButton from '../ui/ConnectTwitchButton'

interface SignedOutCardProps {
  /** True when the visitor is signed out because their Twitch session expired. */
  expired: boolean
  onConnect: () => void
}

/** Shown above the demo grid on `/twitch` to a visitor who is not signed in. */
export default function SignedOutCard({ expired, onConnect }: SignedOutCardProps) {
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md p-3"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {expired
          ? 'Your Twitch sign-in expired. Connect again to see who you follow that is live.'
          : 'Connect Twitch to see who you follow that is live.'}
      </p>
      <ConnectTwitchButton onClick={onConnect} />
    </div>
  )
}
