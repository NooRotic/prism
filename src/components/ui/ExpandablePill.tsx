import { useState } from 'react'

export interface ExpandablePillProps {
  label: string
  description?: string
  icon?: React.ReactNode
  active?: boolean
  accentColor?: string
  onClick?: () => void
}

export function ExpandablePill({
  label,
  description,
  icon,
  active = false,
  accentColor = 'var(--accent-green)',
  onClick,
}: ExpandablePillProps) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick?.()
    }
  }

  const showDescription = (hovered || focused) && !!description
  const highlighted = hovered || focused

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-pressed={active}
      aria-label={description ? `${label}: ${description}` : label}
      className="inline-flex flex-col cursor-pointer select-none rounded-full px-3 py-1.5 transition-all duration-200 outline-none"
      style={{
        border: `1px solid ${
          active
            ? accentColor
            : highlighted
              ? 'rgba(255,255,255,0.25)'
              : 'rgba(255,255,255,0.1)'
        }`,
        backgroundColor: active
          ? `color-mix(in srgb, ${accentColor} 15%, transparent)`
          : 'transparent',
        // Pill shape needs to switch to rounded-lg when expanded to avoid clipping description
        borderRadius: showDescription ? '0.75rem' : '9999px',
      }}
    >
      {/* Pill row — icon + label, always visible */}
      <div className="flex items-center gap-1.5">
        {icon && (
          <span
            className="shrink-0 flex items-center"
            style={{
              color: active ? accentColor : highlighted ? 'white' : 'var(--text-muted)',
              transition: 'color 200ms ease-out',
            }}
          >
            {icon}
          </span>
        )}
        <span
          className="text-xs font-medium leading-none whitespace-nowrap"
          style={{
            color: active
              ? accentColor
              : highlighted
                ? 'var(--text-primary, white)'
                : 'var(--text-muted)',
            transition: 'color 200ms ease-out',
          }}
        >
          {label}
        </span>
      </div>

      {/* Description — expands on hover/focus */}
      {description && (
        <div
          className="overflow-hidden"
          style={{
            maxHeight: showDescription ? '3rem' : '0',
            opacity: showDescription ? 1 : 0,
            transition: 'max-height 200ms ease-out, opacity 200ms ease-out',
          }}
        >
          <p
            className="text-[11px] leading-snug pt-1"
            style={{ color: 'var(--text-secondary)' }}
          >
            {description}
          </p>
        </div>
      )}
    </div>
  )
}
