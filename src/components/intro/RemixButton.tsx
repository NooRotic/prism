import { useCallback } from 'react'

interface RemixButtonProps {
  onRemix: () => void
}

export function RemixButton({ onRemix }: RemixButtonProps) {
  const handleClick = useCallback(() => {
    onRemix()
  }, [onRemix])

  return (
    <button
      onClick={handleClick}
      title="Replay channel intro with a new animation"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        color: 'var(--accent-twitch)',
        background: 'rgba(145, 70, 255, 0.08)',
        border: '1px solid rgba(145, 70, 255, 0.2)',
        borderRadius: '4px',
        padding: '0.35rem 0.7rem',
        cursor: 'pointer',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(145, 70, 255, 0.15)'
        e.currentTarget.style.borderColor = 'rgba(145, 70, 255, 0.4)'
        const icon = e.currentTarget.querySelector<HTMLSpanElement>('[data-remix-icon]')
        if (icon) icon.style.transform = 'rotate(180deg)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(145, 70, 255, 0.08)'
        e.currentTarget.style.borderColor = 'rgba(145, 70, 255, 0.2)'
        const icon = e.currentTarget.querySelector<HTMLSpanElement>('[data-remix-icon]')
        if (icon) icon.style.transform = 'rotate(0deg)'
      }}
    >
      <span
        data-remix-icon=""
        style={{
          display: 'inline-block',
          transition: 'transform 0.3s ease',
          fontSize: '0.85rem',
        }}
      >
        &#x21BB;
      </span>
      Remix
    </button>
  )
}
