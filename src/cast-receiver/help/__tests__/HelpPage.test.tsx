import { render, screen } from '@testing-library/react'
import HelpPage from '../HelpPage'

it('says what PRISM is and links to its three sections, each in its platform colour', () => {
  render(<HelpPage />)
  expect(screen.getByRole('heading', { name: 'PRISM' })).toBeInTheDocument()
  const links = [
    ['Twitch', 'https://prism.nooroticx.tv/twitch', '#9146FF'],
    ['YouTube', 'https://prism.nooroticx.tv/youtube', '#FF0000'],
    ['HLS / DASH', 'https://prism.nooroticx.tv/hls-dash', '#3B82F6'],
  ] as const
  for (const [name, href, colour] of links) {
    // The card's name starts with the section; its one-line description follows.
    const link = screen.getByRole('link', { name: new RegExp(`^${name.replace(/[/]/g, '\\/')}`) })
    expect(link).toHaveAttribute('href', href)
    expect(link).toHaveStyle({ color: colour })
  }
})

it('does not call itself the TV page', () => {
  render(<HelpPage />)
  expect(document.body.textContent).not.toMatch(/page PRISM shows on a TV/)
})

it('tells a TV viewer where the Cast button is', () => {
  render(<HelpPage />)
  expect(screen.getByText('To watch on your TV, open HLS / DASH in Chrome and press the Cast button')).toBeInTheDocument()
})

it('never loads Google’s receiver script', () => {
  render(<HelpPage />)
  expect(document.querySelector('script[src*="cast_receiver"]')).toBeNull()
})
