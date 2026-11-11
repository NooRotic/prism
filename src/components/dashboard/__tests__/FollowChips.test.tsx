import { render, screen, within } from '@testing-library/react'
import FollowChips from '../FollowChips'
import type { FollowStats } from '../../../lib/dashboardStats'

const MIN = 60_000

const full: FollowStats = {
  liveCount: 17,
  loadedCount: 59,
  watching: 8100,
  typicalUptimeMs: 160 * MIN,
  justWentLive: 3,
  longest: { name: 'ragnarok_', ms: 318 * MIN },
  languages: [
    { language: 'en', count: 14 },
    { language: 'de', count: 2 },
    { language: 'fr', count: 1 },
    { language: 'es', count: 1 },
  ],
  oldestLive: { name: 'kestrel', year: 2019 },
}

function chip(label: string): HTMLElement {
  return screen.getByText(label).closest('li') as HTMLElement
}

describe('FollowChips', () => {
  it('lists the seven chips in order inside a labelled list', () => {
    render(<FollowChips stats={full} more={false} />)

    const items = within(screen.getByRole('list', { name: 'Follow stats' })).getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(items.map((li) => li.querySelector('small')?.textContent)).toEqual([
      'Live now',
      'Watching (all follows)',
      'Typical time live',
      'Just went live',
      'Longest live',
      'Languages',
      'Oldest follow live',
    ])
  })

  it('shows each figure', () => {
    render(<FollowChips stats={full} more={false} />)

    expect(chip('Live now')).toHaveTextContent('17 / 59')
    expect(chip('Watching (all follows)')).toHaveTextContent('8.1k')
    expect(chip('Typical time live')).toHaveTextContent('2h 40m')
    expect(chip('Just went live')).toHaveTextContent('3')
    expect(chip('Longest live')).toHaveTextContent('5h 18m · ragnarok_')
    expect(chip('Languages')).toHaveTextContent('EN 14 · DE 2 · FR 1')
    expect(chip('Oldest follow live')).toHaveTextContent('kestrel · 2019')
  })

  it('marks the loaded count as a floor while more follows remain to load', () => {
    render(<FollowChips stats={full} more />)

    expect(chip('Live now')).toHaveTextContent('17 / 59+')
  })

  it('shows 0 for counts and a dash for the rest when nobody is live', () => {
    render(
      <FollowChips
        stats={{
          liveCount: 0,
          loadedCount: 12,
          watching: 0,
          typicalUptimeMs: null,
          justWentLive: 0,
          longest: null,
          languages: [],
          oldestLive: null,
        }}
        more={false}
      />,
    )

    expect(chip('Live now')).toHaveTextContent('0 / 12')
    expect(chip('Watching (all follows)')).toHaveTextContent('0')
    expect(chip('Just went live')).toHaveTextContent('0')
    for (const label of ['Typical time live', 'Longest live', 'Languages', 'Oldest follow live']) {
      expect(chip(label)).toHaveTextContent('–')
    }
  })
})
