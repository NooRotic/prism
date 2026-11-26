import { useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react'

interface TvRingProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'aside'
  className: string
  children: ReactNode
}

/**
 * A panel of the TV page with PRISM's faint rainbow round it. The colour is a wheel that only turns (a transform: the GPU moves
 * it and nothing is drawn again), cut to a 2 px edge. The wheel is the size of the panel's diagonal, enough to fill the panel
 * at every angle and no larger: a full-width square would be a big texture for a Chromecast to hold.
 */
export default function TvRing({ as: Tag = 'div', className, children, ...rest }: TvRingProps) {
  const panel = useRef<HTMLElement | null>(null)
  const [side, setSide] = useState(0)
  useLayoutEffect(() => {
    const element = panel.current
    if (element) setSide(Math.ceil(Math.hypot(element.offsetWidth, element.offsetHeight)))
  }, [])
  return (
    <Tag ref={(element: HTMLElement | null) => void (panel.current = element)} className={`tv-ring ${className}`} {...rest}>
      {children}
      <span aria-hidden="true" className="tv-ring-edge">
        <span className="tv-ring-wheel" style={{ width: side, height: side }} />
      </span>
    </Tag>
  )
}
