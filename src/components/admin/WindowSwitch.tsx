export type AdminWindow = 14 | 30 | 90

interface WindowSwitchProps {
  value: AdminWindow
  onChange: (days: AdminWindow) => void
}

const CHOICES: AdminWindow[] = [14, 30, 90]

/** The 14, 30 and 90 day switch the Usage and TT calls screens share. */
export default function WindowSwitch({ value, onChange }: WindowSwitchProps) {
  return (
    <div role="group" aria-label="Window" className="flex gap-1">
      {CHOICES.map((days) => (
        <button
          key={days}
          type="button"
          aria-pressed={value === days}
          onClick={() => onChange(days)}
          className="rounded border px-3 py-1 text-sm"
          style={{
            borderColor: value === days ? 'var(--accent-green)' : 'var(--border-accent)',
            color: value === days ? 'var(--accent-green)' : 'var(--text-primary)',
          }}
        >
          {days} days
        </button>
      ))}
    </div>
  )
}
