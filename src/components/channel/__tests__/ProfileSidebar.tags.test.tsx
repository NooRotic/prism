import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { AppProvider, useApp } from '../../../contexts/AppContext'
import ProfileSidebar from '../ProfileSidebar'
import type { TwitchChannel, TwitchUser } from '../../../types/twitch'

const profile: TwitchUser = {
  id: '1',
  login: 'jwonggg',
  display_name: 'jwonggg',
  type: '',
  broadcaster_type: 'partner',
  description: 'bio',
  profile_image_url: 'https://example.test/a.png',
  offline_image_url: '',
  view_count: 0,
  created_at: '2011-01-01T00:00:00Z',
}
const channelInfo = (tags: string[]): TwitchChannel => ({
  broadcaster_id: '1',
  broadcaster_login: 'jwonggg',
  broadcaster_name: 'jwonggg',
  broadcaster_language: 'en',
  game_id: '1',
  game_name: 'Capcom vs. SNK 2',
  title: 't',
  delay: 0,
  tags,
  content_classification_labels: [],
  is_branded_content: false,
})

function Seed({ tags }: { tags: string[] }) {
  const { dispatch } = useApp()
  useEffect(() => {
    dispatch({
      type: 'LOAD_CHANNEL_SUCCESS',
      payload: { profile, channelInfo: channelInfo(tags), stream: null, clips: [], videos: [], emotes: [], badges: [], games: new Map() },
    })
  }, [dispatch, tags])
  return null
}

const renderIt = (tags: string[]) =>
  render(
    <AppProvider>
      <Seed tags={tags} />
      <ProfileSidebar />
    </AppProvider>,
  )

describe('ProfileSidebar: the stream tags', () => {
  it('sit on the name row, after the name and the partner badge', () => {
    renderIt(['fgc', 'fightinggames'])
    const name = screen.getByRole('heading', { name: 'jwonggg' })
    const row = name.parentElement!
    const badge = screen.getByText('PARTNER')
    const tag = screen.getByText('fgc')
    expect(row.contains(badge)).toBe(true)
    expect(row.contains(tag)).toBe(true)
    expect(row.contains(screen.getByText('fightinggames'))).toBe(true)
    // Order along the row: name, then badge, then the tags.
    const order = Array.from(row.querySelectorAll('h2, span'))
    expect(order.indexOf(name)).toBeLessThan(order.indexOf(badge))
    expect(order.indexOf(badge)).toBeLessThan(order.indexOf(tag))
  })

  it('show once, not also in a row of their own', () => {
    renderIt(['fgc'])
    expect(screen.getAllByText('fgc')).toHaveLength(1)
  })

  it('leave the name row as it was when the channel has no tags', () => {
    renderIt([])
    const row = screen.getByRole('heading', { name: 'jwonggg' }).parentElement!
    expect(row.querySelectorAll('span')).toHaveLength(1) // the badge only
  })
})
