import { useYoutubeQuotaReached } from '../../hooks/useYoutubeQuota'
import { nextQuotaReset } from '../../lib/youtubeQuota'

/** Shown when YouTube's daily limit is used up: says what is missing and when it comes back, in the viewer's time. */
export default function QuotaNotice() {
  const reached = useYoutubeQuotaReached()
  if (!reached) return null
  const back = nextQuotaReset().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <div
      role="status"
      className="rounded-lg px-4 py-3 text-sm"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--accent-youtube)', color: 'var(--text-secondary)' }}
    >
      {`PRISM has used up YouTube's daily limit, so details, comments, related videos and topic searches are unavailable until about ${back}. The video itself still plays.`}
    </div>
  )
}
