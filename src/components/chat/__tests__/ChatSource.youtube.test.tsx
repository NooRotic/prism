import { render, screen } from '@testing-library/react'
import ChatSource from '../ChatSource'

vi.mock('../../channel/TwitchChatEmbed', () => ({ default: () => <div data-testid="twitch-chat" /> }))

describe('ChatSource for the YouTube chat', () => {
  it('shows YouTube’s chat embed for a video', () => {
    render(<ChatSource kind="youtube" channel="v:abcdefghijk" />)
    expect(screen.getByTitle('YouTube live chat')).toHaveAttribute(
      'src',
      `https://www.youtube.com/live_chat?v=abcdefghijk&embed_domain=${window.location.hostname}`,
    )
  })
  it('says it is looking while the stream is being found', () => {
    render(<ChatSource kind="youtube" channel="looking" />)
    expect(screen.getByText('Looking for the YouTube stream…')).toBeInTheDocument()
  })
  it('says the streamer is not live, with a way to close', () => {
    render(<ChatSource kind="youtube" channel="none:Some One" />)
    expect(screen.getByText("Some One isn't live on YouTube right now")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
  it('says why it failed', () => {
    const { rerender } = render(<ChatSource kind="youtube" channel="failed:error" />)
    expect(screen.getByText("Couldn't reach YouTube.")).toBeInTheDocument()
    rerender(<ChatSource kind="youtube" channel="failed:quota" />)
    expect(screen.getByText("PRISM has used up YouTube's daily limit; try again tomorrow.")).toBeInTheDocument()
  })
  it('still shows the Twitch chat by default', () => {
    render(<ChatSource channel="streamer" />)
    expect(screen.getByTestId('twitch-chat')).toBeInTheDocument()
  })
})
