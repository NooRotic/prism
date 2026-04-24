import { Tv } from 'lucide-react'
import { SmartUrlInput } from '../components/search/SmartUrlInput'
import { ProtocolCard } from '../components/grid/ProtocolCard'
import { FavoritesCard } from '../components/grid/FavoritesCard'
import { getDemoByProtocol, getHlsDashDemo } from '../config/demoContent'

export default function HubPage() {
  const twitchCount = getDemoByProtocol('twitch').length
  const youtubeCount = getDemoByProtocol('youtube').length
  const hlsDashCount = getHlsDashDemo().length

  return (
    <div className="flex flex-col items-center gap-8 px-4 pt-8 pb-12 relative">
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 40%, rgba(57, 255, 20, 0.06), transparent 70%)',
        }}
      />

      {/* Hero */}
      <div className="flex flex-col items-center gap-4 text-center relative z-10">
        <div
          className="p-5 rounded-full"
          style={{ backgroundColor: 'rgba(57, 255, 20, 0.06)', border: '1px solid rgba(57, 255, 20, 0.1)' }}
        >
          <Tv size={44} style={{ color: 'var(--accent-green)' }} strokeWidth={1.5} />
        </div>

        <h1
          className="text-display font-heading"
          style={{ color: 'var(--accent-green)' }}
        >
          PRISM
        </h1>

        <p
          className="max-w-lg leading-relaxed"
          style={{ color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 2vw, 1.2rem)', fontWeight: 300 }}
        >
          Player technology showcase. Explore Twitch, YouTube, HLS, and DASH playback
          with curated demo content and full protocol support.
        </p>

        {/* SmartUrlInput */}
        <div className="w-full max-w-xl mt-2">
          <SmartUrlInput />
        </div>
      </div>

      {/* Protocol card grid — Twitch gets 1.2fr (Law 3: asymmetric) */}
      <div
        className="w-full max-w-4xl grid gap-4 relative z-10"
        style={{
          gridTemplateColumns: '1.2fr 1fr 1fr',
        }}
      >
        <ProtocolCard protocol="twitch" count={twitchCount} />
        <ProtocolCard protocol="youtube" count={youtubeCount} />
        <ProtocolCard protocol="hls-dash" count={hlsDashCount} />
      </div>

      {/* Favorites card (locked when unauth'd) */}
      <div className="w-full max-w-4xl relative z-10">
        <FavoritesCard />
      </div>

      {/* Subtle hints */}
      <div className="flex gap-6 mt-2">
        {['Clips', 'VODs', 'Stats', 'Emotes', 'Badges'].map((label) => (
          <span
            key={label}
            className="text-label"
            style={{ color: 'var(--text-muted)', opacity: 0.5 }}
          >
            {label}
          </span>
        ))}
      </div>

      <p className="text-sm max-w-md text-center" style={{ color: 'var(--text-muted)', fontWeight: 300 }}>
        Paste any <span style={{ color: 'var(--accent-twitch)' }}>Twitch</span>,{' '}
        <span style={{ color: 'var(--accent-youtube)' }}>YouTube</span>, or{' '}
        <span style={{ color: 'var(--accent-hls)' }}>HLS/DASH</span> URL to play instantly.
        Connect Twitch for full channel exploration.
      </p>
    </div>
  )
}
