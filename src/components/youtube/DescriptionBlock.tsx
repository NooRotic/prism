import { useState } from 'react'
import { linkify } from '../../lib/videoFormat'

const FOLD_AT = 400

/** The whole description: line breaks kept, URLs as safe links, folded behind "Show more" when long. Text only, never HTML. */
export default function DescriptionBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (!text) return null
  const long = text.length > FOLD_AT
  return (
    <section
      aria-label="Description"
      className="rounded-lg p-4 flex flex-col gap-2"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <p
        className={`text-sm leading-relaxed whitespace-pre-wrap break-words ${long && !open ? 'line-clamp-6' : ''}`}
        style={{ color: 'var(--text-primary)' }}
      >
        {linkify(text).map((part, i) =>
          part.href ? (
            <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent-youtube)' }}>
              {part.text}
            </a>
          ) : (
            <span key={i}>{part.text}</span>
          ),
        )}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="self-start text-sm font-medium cursor-pointer"
          style={{ color: 'var(--accent-youtube)', background: 'none', border: 'none', padding: 0 }}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </section>
  )
}
