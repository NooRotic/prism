import ConnectTwitchPrompt from '../ui/ConnectTwitchPrompt'
import { useTwitchAuth } from '../../hooks/useTwitchAuth'

export function FavoritesCard() {
  const { isAuthenticated, login } = useTwitchAuth()

  if (isAuthenticated) return null

  return (
    <div
      className="rounded flex flex-col items-center justify-center gap-3 p-6 text-center"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--accent-twitch)',
        borderRadius: '4px',
        opacity: 0.7,
      }}
    >
      <ConnectTwitchPrompt
        title="Your Favorites"
        description="Connect Twitch to see your followed channels"
        onConnect={login}
      />
    </div>
  )
}
