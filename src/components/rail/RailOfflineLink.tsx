interface RailOfflineLinkProps {
  /** Follows who are not live right now. */
  count: number
  /** True while more follows are still to be loaded, which makes `count` a floor, not a total. */
  more: boolean
  expanded: boolean
  onClick: () => void
}

/**
 * The last entry of the rail's Following list: how many follows are offline, and a way to
 * the Following panel, which lists live and offline together. Like RailEntryCard, the
 * collapsed circle and the expanded row are one element at two widths, so opening the rail
 * never remounts it.
 */
export default function RailOfflineLink({ count, more, expanded, onClick }: RailOfflineLinkProps) {
  const shown = `${count}${more ? '+' : ''}`
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${shown} offline, open Following`}
      title="Open Following"
      className="flex items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/5"
    >
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs"
        style={{
          // Dashed, not the live avatars' solid ring: this is a count, not a person.
          border: '1px dashed var(--border-accent)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {shown}
      </span>
      {expanded && (
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          offline
        </span>
      )}
    </button>
  )
}
