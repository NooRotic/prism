import { useEffect, useState } from 'react'
import { getVideoPage, type VideoPageData } from '../lib/videoPageApi'

/** One video's details. An answer is kept with the id it was for, so a late reply for a previous video is never shown. */
export function useVideoPage(id: string): { data: VideoPageData | null; status: 'loading' | 'ready' | 'unavailable' } {
  const [answer, setAnswer] = useState<{ id: string; data: VideoPageData | null } | null>(null)
  useEffect(() => {
    let cancelled = false
    getVideoPage(id).then((data) => {
      if (!cancelled) setAnswer({ id, data })
    })
    return () => {
      cancelled = true
    }
  }, [id])
  if (!answer || answer.id !== id) return { data: null, status: 'loading' }
  return { data: answer.data, status: answer.data ? 'ready' : 'unavailable' }
}
