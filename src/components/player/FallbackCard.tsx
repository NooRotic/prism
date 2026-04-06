import { ExternalLink, AlertTriangle } from 'lucide-react'
import type { URLDetectionResult } from '../../lib/urlDetection'

interface FallbackCardProps {
  detection: URLDetectionResult
  error?: string | null
}

function getWatchUrl(detection: URLDetectionResult): {
  url: string
  label: string
} {
  if (detection.type === 'youtube') {
    return { url: detection.originalUrl, label: 'Watch on YouTube' }
  }
  if (detection.type === 'twitch') {
    return { url: detection.originalUrl, label: 'Watch on Twitch' }
  }
  return { url: detection.originalUrl, label: 'Open Link' }
}

function getThumbnailUrl(detection: URLDetectionResult): string | null {
  if (
    detection.type === 'twitch' &&
    detection.platform === 'twitch-stream' &&
    detection.metadata?.channelName
  ) {
    // Twitch static preview (may not always be available)
    return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${detection.metadata.channelName.toLowerCase()}-640x360.jpg`
  }
  return null
}

export default function FallbackCard({ detection, error }: FallbackCardProps) {
  const { url: watchUrl, label: watchLabel } = getWatchUrl(detection)
  const thumbnail = getThumbnailUrl(detection)

  return (
    <div
      className="flex flex-col items-center justify-center w-full h-full gap-6 p-8"
      style={{
        minHeight: 300,
        backgroundColor: 'var(--bg-card)',
        borderRadius: 12,
        border: '1px solid var(--border)',
      }}
    >
      {/* Thumbnail */}
      {thumbnail && (
        <div className="relative w-full max-w-md overflow-hidden rounded-lg">
          <img
            src={thumbnail}
            alt="Stream preview"
            className="w-full object-cover opacity-60"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        </div>
      )}

      {/* Error icon and message */}
      <div className="flex flex-col items-center gap-3 text-center">
        <AlertTriangle
          size={40}
          style={{ color: 'var(--accent-orange)' }}
        />
        <h3
          className="text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          Unable to Play
        </h3>
        {error && (
          <p
            className="text-sm max-w-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            {error}
          </p>
        )}
      </div>

      {/* Direct link button */}
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all duration-200 hover:scale-105"
        style={{
          backgroundColor: 'var(--accent-green)',
          color: 'var(--bg)',
        }}
      >
        <ExternalLink size={16} />
        {watchLabel}
      </a>
    </div>
  )
}
