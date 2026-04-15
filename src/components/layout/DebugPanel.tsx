import { Gauge } from 'lucide-react'
import { useApp } from '../../contexts/AppContext'
import { getURLTypeDisplayName } from '../../lib/urlDetection'

/**
 * Debug panel harness — shown when state.player.debugMode is enabled
 * via the Settings icon in PlayerHost. Intentionally minimal for
 * phase 2: header, a summary of the active engine, and a placeholder
 * body where QoE metrics (bitrate, buffer level, dropped frames,
 * decode time, etc.) will land in a later PR.
 *
 * Kept separate from PlayerHost's in-player debug overlay because the
 * overlay shows ENGINE-level state (fallback chain, content id, parent
 * host) while this panel is for PLAYBACK-level metrics — things the
 * <video> element or the Video.js/DASH.js/react-player instances
 * report.
 */
export default function DebugPanel() {
  const { state } = useApp()
  const { debugMode, activeEngine, detection } = state.player

  if (!debugMode) return null

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

      {/* Subheader: current content identification */}
      {detection && (
        <div
          className="text-xs"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span style={{ color: 'var(--text-secondary)' }}>
            {getURLTypeDisplayName(detection)}
          </span>
          {' · '}
          <span>{detection.originalUrl}</span>
        </div>
      )}

      {/* Empty body — QoE metrics will land here in a later PR */}
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
          Playback metrics will appear here when a player reports them.
        </p>
      </div>
    </div>
  )
}
