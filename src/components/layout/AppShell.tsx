import { useEffect } from 'react'
import { Loader2, X, Tv } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { getURLTypeDisplayName, getSourceColor } from '../../lib/urlDetection'
import PlayerHost from '../player/PlayerHost'
import ProfileSidebar from '../channel/ProfileSidebar'
import StatsRow from '../channel/StatsRow'
import ClipGrid from '../channel/ClipGrid'
import VODGrid from '../channel/VODGrid'
import { SmartUrlInput } from '../search/SmartUrlInput'
import DebugPanel from './DebugPanel'

function IdleView() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] gap-8 px-4 text-center relative">
      {/* Ambient glow behind hero */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 40%, rgba(57, 255, 20, 0.06), transparent 70%)',
        }}
      />

      <div
        className="animate-reveal animate-reveal-1 p-5 rounded-full relative"
        style={{ backgroundColor: 'rgba(57, 255, 20, 0.06)', border: '1px solid rgba(57, 255, 20, 0.1)' }}
      >
        <Tv size={44} style={{ color: 'var(--accent-green)' }} strokeWidth={1.5} />
      </div>

      <h1 className="animate-reveal animate-reveal-2 text-display font-heading animate-glow"
        style={{ color: 'var(--accent-green)' }}
      >
        GLAZE ME
      </h1>

      <p
        className="animate-reveal animate-reveal-3 max-w-lg leading-relaxed"
        style={{ color: 'var(--text-secondary)', fontSize: 'clamp(1rem, 2vw, 1.2rem)', fontWeight: 300 }}
      >
        The boldest way to explore a Twitch channel. Clips, VODs, stats, emotes, and
        everything that makes a streamer who they are.
      </p>

      {/* Real input — replaces the old decorative badge. Renders a second
          SmartUrlInput instance alongside the Header one; the Header copy
          takes over after displayMode flips out of 'idle'. */}
      <div className="animate-reveal animate-reveal-4 w-full max-w-xl">
        <SmartUrlInput />
      </div>

      {/* Subtle feature hints */}
      <div className="animate-reveal animate-reveal-5 flex gap-6 mt-4">
        {['Clips', 'VODs', 'Stats', 'Emotes', 'Badges'].map((label, i) => (
          <span
            key={label}
            className="text-label"
            style={{
              color: 'var(--text-muted)',
              opacity: 0.5,
              animationDelay: `${600 + i * 80}ms`,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Unauth capabilities note */}
      <div
        className="animate-reveal animate-reveal-5 mt-2 max-w-md"
        style={{ animationDelay: '700ms' }}
      >
        <p className="text-sm" style={{ color: 'var(--text-muted)', fontWeight: 300 }}>
          Paste any <span style={{ color: 'var(--accent-twitch)' }}>Twitch</span>,{' '}
          <span style={{ color: 'var(--accent-youtube)' }}>YouTube</span>, or{' '}
          <span style={{ color: 'var(--accent-hls)' }}>HLS/DASH</span> URL to play instantly.
          Connect Twitch for full channel exploration.
        </p>
      </div>
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3">
        <Loader2
          size={40}
          className="animate-spin"
          style={{ color: 'var(--accent-green)' }}
        />
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--text-secondary)' }}
        >
          Loading channel data...
        </span>
      </div>
    </div>
  )
}

function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 8000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      className="fixed top-4 right-4 z-50 flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg max-w-sm animate-in slide-in-from-right"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid #ef4444',
        color: 'var(--text-primary)',
      }}
    >
      <span className="text-sm flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

function VideoLayout() {
  const { state } = useApp()
  const { player } = state
  const detection = player.detection
  const typeLabel = detection ? getURLTypeDisplayName(detection) : ''
  const accentColor = detection ? getSourceColor(detection) : 'var(--accent-green)'

  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h2
            className="text-lg font-bold font-heading uppercase tracking-wider"
            style={{ color: accentColor }}
          >
            {typeLabel || 'Video'} Player
          </h2>
        </div>
        <span
          className="text-xs truncate shrink min-w-0"
          style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}
          title={player.currentUrl}
        >
          {player.currentUrl}
        </span>
      </div>

      {/* Player */}
      <div
        className="w-full aspect-video rounded-lg overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: `2px solid ${accentColor}`,
          boxShadow: `0 0 20px ${accentColor}22`,
        }}
      >
        {player.currentUrl && player.detection ? (
          <PlayerHost url={player.currentUrl} detection={player.detection} />
        ) : (
          <div
            className="flex items-center justify-center w-full h-full"
            style={{ color: 'var(--text-muted)' }}
          >
            <div className="flex flex-col items-center gap-2">
              <Tv size={32} />
              <span className="text-sm">No video loaded</span>
            </div>
          </div>
        )}
      </div>

      {/* Debug panel */}
      <DebugPanel />
    </div>
  )
}

function ChannelLayout() {
  const { state } = useApp()
  const { player } = state
  const currentUrl = player.currentUrl

  // Scroll the player back into view whenever the user picks a new clip/VOD
  // or pastes a URL. Watches the URL string so any source of change (cards,
  // SmartUrlInput, QuickLinks) triggers the same scroll behavior in one place.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentUrl])

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top row: Player + ProfileSidebar */}
      <div className="flex flex-col md:flex-row gap-4 w-full">
        {/* Player area.
            No `overflow-hidden` — Twitch's autoplay "style visibility"
            check in the Embed SDK is triggered by clipping ancestors in
            some cases. The rounded corners are applied via `border-radius`
            on the inline style so the iframe's corners still look clipped
            visually without changing the box's overflow behavior. */}
        <div
          className="w-full md:w-[70%] aspect-video rounded-lg"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border)',
          }}
        >
          {player.currentUrl && player.detection ? (
            <PlayerHost url={player.currentUrl} detection={player.detection} />
          ) : (
            <div
              className="flex items-center justify-center w-full h-full"
              style={{ color: 'var(--text-muted)' }}
            >
              <div className="flex flex-col items-center gap-2">
                <Tv size={32} />
                <span className="text-sm">Select a clip or VOD to play</span>
              </div>
            </div>
          )}
        </div>

        {/* Profile sidebar */}
        <div className="w-full md:w-[30%]">
          <ProfileSidebar />
        </div>
      </div>

      {/* Stats row */}
      <StatsRow />

      {/* Debug panel — only visible when debugMode is toggled on via
          the Settings icon in PlayerHost. Sits above the clips/VODs
          grids so it's adjacent to the player but doesn't eat viewport. */}
      <DebugPanel />

      {/* Bottom row: Clips + VODs */}
      <div className="flex flex-col lg:flex-row gap-4 w-full">
        <div className="w-full lg:w-1/2">
          <ClipGrid />
        </div>
        <div className="w-full lg:w-1/2">
          <VODGrid />
        </div>
      </div>
    </div>
  )
}

export default function AppShell() {
  const { state, dispatch } = useApp()

  // Derive error visibility from state directly (no effect needed)
  const showError = !!state.error

  const dismissError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  return (
    <div
      className="min-h-screen w-full px-4 md:px-6 lg:px-8 pb-8"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {state.loading && <LoadingOverlay />}

      {showError && state.error && (
        <ErrorToast message={state.error} onDismiss={dismissError} />
      )}

      <main className="max-w-[1600px] mx-auto pt-4">
        {state.displayMode === 'idle' ? (
          <IdleView />
        ) : state.displayMode === 'video' ? (
          <VideoLayout />
        ) : (
          <ChannelLayout />
        )}
      </main>
    </div>
  )
}
