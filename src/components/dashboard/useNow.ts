import { useEffect, useState } from 'react'

/** The current time in ms, refreshed on an interval so uptimes tick without refetching anything. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
