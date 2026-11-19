/** Chip background, a step lighter than the page card so the chip reads as a button. Text is --text-primary on it (AA, see contrast.test). */
export const TAG_CHIP_BG = '#22222e'

/** A tag or topic. A button when it does something, plain text when it does not. Body-size text, not a tiny pill. */
export default function TagChip({ label, onClick }: { label: string; onClick?: () => void }) {
  const className = 'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium leading-snug'
  const style = {
    backgroundColor: TAG_CHIP_BG,
    color: 'var(--text-primary)',
    border: '1px solid color-mix(in srgb, var(--accent-youtube) 55%, transparent)',
  }
  if (!onClick) {
    return (
      <span className={className} style={style}>
        {label}
      </span>
    )
  }
  return (
    <button type="button" onClick={onClick} className={`${className} cursor-pointer hover:brightness-125`} style={style}>
      {label}
    </button>
  )
}
