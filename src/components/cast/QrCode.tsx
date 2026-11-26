import { useId, useMemo } from 'react'
import { QR_LOOKS, qrModel, type QrStyle } from '../../lib/cast/qrCode'
import { PrismIconDrawing } from './PrismIcon'

interface QrCodeProps {
  text: string
  styleName: QrStyle
  className?: string
}

/** A QR code in one of PRISM's looks: round dots, coloured corner squares, the mark in the middle. */
export default function QrCode({ text, styleName, className }: QrCodeProps) {
  const model = useMemo(() => qrModel(text), [text])
  const look = QR_LOOKS[styleName]
  // An id of its own, for two codes on one page; React's ids hold characters a url(#...) reference does not take.
  const gradient = `qr-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const q = model.quiet
  const full = model.size + q * 2
  const box = model.hole.span + 1.2
  const boxAt = q + (model.size - box) / 2
  const stops = look.stops.length > 1 ? look.stops : [look.stops[0], look.stops[0]]

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${full} ${full}`} className={className} role="img" aria-label="QR code">
      <defs>
        <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={full} y2={full}>
          {stops.map((color, i) => (
            <stop key={i} offset={i / (stops.length - 1)} stopColor={color} />
          ))}
        </linearGradient>
      </defs>
      <rect width={full} height={full} rx={full * 0.06} fill={look.card} />
      <g fill={`url(#${gradient})`}>
        {model.dots.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x + q + 0.5} cy={y + q + 0.5} r={0.5} />
        ))}
      </g>
      {model.eyes.map(([x, y], i) => (
        <g key={i}>
          <rect x={x + q + 0.5} y={y + q + 0.5} width={6} height={6} rx={1.7} fill="none" stroke={look.eyes[i]} strokeWidth={1} />
          <rect x={x + q + 2} y={y + q + 2} width={3} height={3} rx={0.9} fill={look.eyes[i]} />
        </g>
      ))}
      <rect x={boxAt} y={boxAt} width={box} height={box} rx={box * 0.2} fill="#050507" />
      <g transform={`translate(${boxAt + box * 0.08} ${boxAt + box * 0.08}) scale(${(box * 0.84) / 64})`}>
        <PrismIconDrawing />
      </g>
    </svg>
  )
}
