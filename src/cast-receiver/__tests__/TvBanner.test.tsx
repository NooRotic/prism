import { render, screen } from '@testing-library/react'
import TvBanner from '../TvBanner'

const banner = () => screen.getByTestId('tv-banner')

it('puts the state above the name, in rainbow letters while tuning', () => {
  render(<TvBanner name="News One" entry={null} group="News" state="tuning" live debug={null} />)
  const state = banner().querySelector('.tv-state')
  const name = banner().querySelector('.tv-banner-name')
  expect(state).toHaveTextContent('Tuning…')
  expect(state && name && state.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(banner().querySelector('.tv-state-rainbow')).not.toBeNull()
})

it('turns quiet once it plays: Live and the group', () => {
  render(<TvBanner name="News One" entry={null} group="News" state="playing" live debug="PLAYING · 1920×1080" />)
  expect(banner().querySelector('.tv-state')).toHaveTextContent('Live · News')
  expect(banner().querySelector('.tv-state-rainbow')).toBeNull()
  expect(banner()).toHaveTextContent('PLAYING · 1920×1080')
})

it('says Playing for a recording, and only the group for a flip that waits', () => {
  const { rerender } = render(<TvBanner name="Old Film" entry={null} group={null} state="playing" live={false} debug={null} />)
  expect(banner().querySelector('.tv-state')).toHaveTextContent('Playing')
  rerender(<TvBanner name="Sports Live" entry={null} group="Fun" state={null} live debug={null} />)
  expect(banner().querySelector('.tv-state')).toHaveTextContent('Fun')
})

it('has PRISM’s mark, and a compact form for beside the guide', () => {
  render(<TvBanner name="News One" entry={null} group={null} state="playing" live debug={null} compact />)
  expect(screen.getByTestId('tv-now').querySelector('svg[data-prism-icon]')).not.toBeNull()
})
