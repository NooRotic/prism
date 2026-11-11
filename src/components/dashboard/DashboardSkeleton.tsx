/** Placeholder blocks in the positions of the dashboard's strip, chips and wall while data loads. */
export default function DashboardSkeleton() {
  const block = { backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }
  return (
    <div role="status" aria-label="Loading your dashboard" className="flex animate-pulse flex-col gap-4">
      <div className="h-[68px] rounded-md" style={block} />
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-[52px] rounded-md md:w-36" style={block} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[2.1fr_1fr]">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-video rounded-md" style={block} />
          ))}
        </div>
        <div className="h-48 rounded-md" style={block} />
      </div>
    </div>
  )
}
