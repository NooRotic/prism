interface StatTileProps {
  label: string
  value: string
  /** A smaller line under the value: a change, a limit, a qualifier. */
  note?: string
}

/** One headline number. */
export default function StatTile({ label, value, note }: StatTileProps) {
  return (
    <div className="rounded-lg border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-accent)' }}>
      <p className="m-0 text-xs uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
        {value}
      </p>
      {note !== undefined && (
        <p className="m-0 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      )}
    </div>
  )
}
