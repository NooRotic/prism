import { render, screen } from '@testing-library/react'
import type { CastView } from '../../../lib/cast/castSender'
import { NO_CAST } from '../../../lib/cast/castSender'
import CastComingSoon from '../CastComingSoon'
import { CastContext, type CastApi } from '../castContext'

const api = (view: Partial<CastView>): CastApi => ({ ...NO_CAST, ...view, load: vi.fn(), start: vi.fn(), tune: vi.fn(), togglePause: vi.fn(), stop: vi.fn(), clearEnded: vi.fn(), offer: vi.fn() })

const tree = (value: CastApi) => (
  <CastContext value={value}>
    <CastComingSoon platform="Twitch" />
  </CastContext>
)

const CONNECTED = { connected: true, device: 'TV', now: { id: 'a', name: 'News One', state: 'playing' as const } }

it('says Twitch comes later and what the TV keeps playing', () => {
  render(tree(api(CONNECTED)))
  const line = screen.getByRole('status')
  expect(line).toHaveTextContent('Casting Twitch is coming soon. Your TV keeps playing News One.')
  expect(line).toHaveClass('fill-hide')
})

it('names nothing when the TV plays nothing', () => {
  render(tree(api({ ...CONNECTED, now: null })))
  expect(screen.getByRole('status').textContent).toBe('Casting Twitch is coming soon.')
})

it.each(['idle', 'failed', 'ended'] as const)('does not claim the TV keeps playing when it is %s', (state) => {
  render(tree(api({ ...CONNECTED, now: { id: 'a', name: 'News One', state } })))
  expect(screen.getByRole('status').textContent).toBe('Casting Twitch is coming soon.')
})

it('is not there without a cast, and goes when the cast ends, sending nothing', () => {
  const value = api(CONNECTED)
  const { rerender, container } = render(tree(value))
  const after = api({ endedBySelf: true })
  rerender(tree(after))
  expect(container).toBeEmptyDOMElement()
  for (const call of [value.tune, value.start, value.stop, after.tune, after.start]) expect(call).not.toHaveBeenCalled()
})
