import TagChip from './TagChip'

/**
 * Topic buttons. A click opens that topic in the player's place (the page runs the search).
 * Without an API key the topics are plain text, because a click could not do anything.
 */
export default function RelatedTopics({
  topics,
  apiAvailable,
  onPick,
}: {
  topics: string[]
  apiAvailable: boolean
  onPick?: (topic: string) => void
}) {
  if (topics.length === 0) return null
  return (
    <section aria-label="Related topics" className="flex flex-col gap-3">
      <h2 className="text-base font-bold uppercase tracking-wider font-heading" style={{ color: 'var(--text-primary)' }}>
        Related topics
      </h2>
      <div className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <TagChip key={t} label={t} onClick={apiAvailable && onPick ? () => onPick(t) : undefined} />
        ))}
      </div>
    </section>
  )
}
