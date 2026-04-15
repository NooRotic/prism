import { useSyncExternalStore } from 'react'
import { Gauge } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { getURLTypeDisplayName } from '../../lib/urlDetection'
import {
  subscribePlayerMetrics,
  getPlayerMetrics,
  type PlaybackMetrics,
} from '../../lib/playerMetrics'

/**
 * Debug panel — shown when state.player.debugMode is enabled via the
 * Settings icon in PlayerHost. Renders live playback QoE metrics
 * pushed from the active player (Video.js / DASH.js / Twitch SDK /
 * ReactPlayer) via the module-level playerMetrics store.
 *
 * Subscribes to the store on mount and unsubscribes on unmount, so
 * when debug mode is off this component is unmounted and the store
 * has zero listeners (metric updates become cheap no-ops from the
 * player's point of view).
 */

// ─── Metric card formatting helpers ──────────────────────────────

function formatBitrate(bps: number | null): string {
  if (bps === null) return '—'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`
  return `${bps} bps`
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(0)} KB`
  return `${bytes} B`
}

function formatTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  return formatTime(seconds)
}

function formatBufferLength(seconds: number | null): string {
  if (seconds === null) return '—'
  return `${seconds.toFixed(1)}s`
}

function formatVolume(volume: number | null, muted: boolean | null): string {
  if (muted) return 'muted'
  if (volume === null) return '—'
  return `${Math.round(volume * 100)}%`
}

function formatBoolean(value: boolean | null): string {
  if (value === null) return '—'
  return value ? 'yes' : 'no'
}

// ─── Single metric row ───────────────────────────────────────────

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {label}
      </span>
      <span
        className="text-xs font-medium"
        style={{
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Section group ───────────────────────────────────────────────

function MetricSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className="flex flex-col p-3 rounded-md"
      style={{
        backgroundColor: 'var(--bg-card-hover)',
        border: '1px solid var(--border)',
      }}
    >
      <span
        className="text-[10px] uppercase tracking-wider font-bold mb-2"
        style={{ color: 'var(--accent-green)' }}
      >
        {title}
      </span>
      {children}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────

export default function DebugPanel() {
  const { state } = useApp()
  const { debugMode, activeEngine, detection } = state.player

  // useSyncExternalStore is the React-sanctioned way to subscribe to
  // an external mutable store. It handles the subscribe/unsubscribe
  // lifecycle AND the initial snapshot read without the
  // set-state-in-effect anti-pattern. When the component unmounts
  // (e.g. debugMode flips off), the subscription cleans up and the
  // playerMetrics store drops back to zero listeners — so the
  // setter becomes a cheap no-op.
  const metrics = useSyncExternalStore<PlaybackMetrics | null>(
    subscribePlayerMetrics,
    getPlayerMetrics,
  )

  if (!debugMode) return null

  const hasMetrics = metrics !== null

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-accent)',
      }}
      role="region"
      aria-label="Debug Panel"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Gauge size={16} style={{ color: 'var(--accent-green)' }} />
        <h3
          className="text-sm uppercase tracking-wider font-bold"
          style={{
            color: 'var(--accent-green)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          Debug Panel
        </h3>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded ml-auto"
          style={{
            backgroundColor: 'rgba(57, 255, 20, 0.12)',
            color: 'var(--accent-green)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {activeEngine}
        </span>
      </div>

      {/* Subheader: current content */}
      {detection && (
        <div
          className="text-xs truncate"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
          title={detection.originalUrl}
        >
          <span style={{ color: 'var(--text-secondary)' }}>
            {getURLTypeDisplayName(detection)}
          </span>
          {' · '}
          <span>{detection.originalUrl}</span>
        </div>
      )}

      {/* Metrics body */}
      {!hasMetrics && (
        <div
          className="flex items-center justify-center py-8 rounded-md"
          style={{
            backgroundColor: 'var(--bg-card-hover)',
            border: '1px dashed var(--border)',
            color: 'var(--text-muted)',
          }}
        >
          <p
            className="text-xs"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            Waiting for player to report metrics…
          </p>
        </div>
      )}

      {hasMetrics && metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <MetricSection title="Playback">
            <MetricRow
              label="Time"
              value={formatTime(metrics.currentTime)}
            />
            <MetricRow
              label="Duration"
              value={formatDuration(metrics.duration)}
            />
            <MetricRow label="Paused" value={formatBoolean(metrics.paused)} />
            <MetricRow
              label="Volume"
              value={formatVolume(metrics.volume, metrics.muted)}
            />
          </MetricSection>

          <MetricSection title="Quality">
            <MetricRow label="Quality" value={metrics.quality ?? '—'} />
            <MetricRow
              label="Resolution"
              value={metrics.resolution ?? '—'}
            />
            <MetricRow label="Bitrate" value={formatBitrate(metrics.bitrate)} />
          </MetricSection>

          <MetricSection title="Network & Buffer">
            <MetricRow
              label="Buffer"
              value={formatBufferLength(metrics.bufferLength)}
            />
            <MetricRow
              label="Dropped frames"
              value={
                metrics.droppedFrames === null
                  ? '—'
                  : metrics.droppedFrames.toLocaleString()
              }
            />
            <MetricRow
              label="Transferred"
              value={formatBytes(metrics.bytesTransferred)}
            />
          </MetricSection>
        </div>
      )}
    </div>
  )
}
