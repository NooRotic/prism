/** PRISM's app icon (the drawing of cast/public/icon.svg and the site's favicon), on a 64 x 64 grid, without its tile. */
export function PrismIconDrawing() {
  return (
    <g fill="none">
      <path d="M39 27 L63 23" stroke="#9146ff" strokeWidth="6" />
      <path d="M41 32 L63 35" stroke="#ff0000" strokeWidth="6" />
      <path d="M44 37 L63 47" stroke="#39ff14" strokeWidth="6" />
      <path d="M2 41 L21 31" stroke="#fefefe" strokeWidth="5" />
      <path d="M30 11 L50 50 L10 50Z" stroke="#fefefe" strokeWidth="5.5" strokeLinejoin="round" fill="#050507" />
    </g>
  )
}

/** The app icon on its dark rounded tile, drawn inline (no file to fetch), for the TV page. Decorative. */
export default function PrismIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={className} aria-hidden="true" data-prism-icon="">
      <rect width="64" height="64" rx="13" fill="#050507" />
      <PrismIconDrawing />
    </svg>
  )
}
