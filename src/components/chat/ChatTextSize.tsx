interface ChatTextSizeProps {
  scale: number
  canSmaller: boolean
  canLarger: boolean
  onSmaller: () => void
  onLarger: () => void
  onReset: () => void
}

const buttonClass =
  'rounded-md px-1 text-xs leading-5 transition-colors hover:bg-white/5 aria-disabled:opacity-40 aria-disabled:hover:bg-transparent'

/**
 * Chat text size: smaller, a percentage that resets, larger. At either end of the
 * range a button is aria-disabled and ignores clicks rather than `disabled`, since
 * a disabled button drops keyboard focus to the page body. Used by the chat header
 * and by the pop-out window's strip.
 */
export default function ChatTextSize({
  scale,
  canSmaller,
  canLarger,
  onSmaller,
  onLarger,
  onReset,
}: ChatTextSizeProps) {
  const percent = `${Math.round(scale * 100)}%`
  return (
    <div role="group" aria-label="Chat text size" className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Smaller chat text"
        title="Smaller chat text"
        aria-disabled={!canSmaller}
        onClick={() => {
          if (canSmaller) onSmaller()
        }}
        className={buttonClass}
      >
        A−
      </button>
      <button
        type="button"
        aria-label={`Reset chat text size, ${percent}`}
        title="Reset chat text size"
        onClick={onReset}
        className={`${buttonClass} min-w-10 tabular-nums`}
      >
        {percent}
      </button>
      <button
        type="button"
        aria-label="Larger chat text"
        title="Larger chat text"
        aria-disabled={!canLarger}
        onClick={() => {
          if (canLarger) onLarger()
        }}
        className={buttonClass}
      >
        A+
      </button>
    </div>
  )
}
