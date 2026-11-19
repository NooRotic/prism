import { useEffect, useState } from 'react'
import { getComments, type CommentsResult } from '../lib/videoPageApi'

/** A video's top comments; `result` is null while loading (and right after the id changes). */
export function useVideoComments(id: string): { result: CommentsResult | null } {
  const [answer, setAnswer] = useState<{ id: string; result: CommentsResult } | null>(null)
  useEffect(() => {
    let cancelled = false
    getComments(id).then((result) => {
      if (!cancelled) setAnswer({ id, result })
    })
    return () => {
      cancelled = true
    }
  }, [id])
  return { result: answer && answer.id === id ? answer.result : null }
}
