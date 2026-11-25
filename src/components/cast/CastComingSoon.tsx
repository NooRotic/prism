import { useCast } from './castContext'

const ON = ['tuning', 'playing', 'buffering', 'paused']

/** On a Twitch or YouTube page while casting: one line above the player, never over it. Nothing is sent to the TV. */
export default function CastComingSoon({ platform }: { platform: 'Twitch' | 'YouTube' }) {
  const { connected, now } = useCast()
  if (!connected) return null
  const keeps = now !== null && ON.includes(now.state)
  return (
    <p
      role="status"
      className="fill-hide w-full rounded-md border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--border-accent)', color: 'var(--text-secondary)' }}
    >
      {`Casting ${platform} is coming soon.`}
      {keeps && ` Your TV keeps playing ${now.name}.`}
    </p>
  )
}
