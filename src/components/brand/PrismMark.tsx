import { useEffect, useRef } from 'react'
import { mountPrismMark, STILL_SECONDS } from '../../lib/prismMark'

interface PrismMarkProps {
  /** `icon` is the static header pose (hover pulses the rays); `hero` is the landing mark with its intro and routing loop. */
  variant?: 'hero' | 'icon'
  /** Icon only: pulse the rays when the pointer enters the nearest link (or the mark itself). */
  hover?: boolean
  /** Hero only: draw the PRISM wordmark under the prism. */
  wordmark?: boolean
  className?: string
}

/**
 * The PRISM mark. Decorative: the real name of the app stays in text beside or above it, so the SVG is aria-hidden.
 * The hero draws itself with requestAnimationFrame (which the browser pauses in a background tab) and shows a single still frame
 * (the first address read and routed) when the visitor prefers reduced motion.
 */
export function PrismMark({ variant = 'hero', hover = false, wordmark = true, className }: PrismMarkProps) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = host.current
    if (!node) return
    const mark = mountPrismMark(node, { mode: variant, wordmark })
    let frame = 0
    let pulse = 0
    const cleanups: Array<() => void> = []

    if (variant === 'icon') {
      mark.render(0, 0)
      const target = node.closest('a') ?? node
      const onEnter = () => {
        const start = performance.now()
        cancelAnimationFrame(pulse)
        const step = (now: number) => {
          const progress = Math.min((now - start) / 600, 1)
          mark.render(0, progress < 1 ? progress : 0)
          if (progress < 1) pulse = requestAnimationFrame(step)
        }
        pulse = requestAnimationFrame(step)
      }
      if (hover) {
        target.addEventListener('mouseenter', onEnter)
        cleanups.push(() => target.removeEventListener('mouseenter', onEnter))
      }
    } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      mark.render(STILL_SECONDS)
    } else {
      const start = performance.now()
      const tick = (now: number) => {
        mark.render((now - start) / 1000)
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(pulse)
      cleanups.forEach((fn) => fn())
      mark.svg.remove()
    }
  }, [variant, hover, wordmark])

  return <div ref={host} className={className} data-prism-mark={variant} />
}
