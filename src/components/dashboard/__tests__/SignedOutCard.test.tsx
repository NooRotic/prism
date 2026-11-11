import { fireEvent, render, screen } from '@testing-library/react'
import SignedOutCard from '../SignedOutCard'

describe('SignedOutCard', () => {
  it('invites a signed-out visitor to connect Twitch', () => {
    render(<SignedOutCard expired={false} onConnect={vi.fn()} />)

    expect(screen.getByText('Connect Twitch to see who you follow that is live.')).toBeInTheDocument()
  })

  it('says the sign-in expired when that is why the viewer is signed out', () => {
    render(<SignedOutCard expired onConnect={vi.fn()} />)

    expect(
      screen.getByText('Your Twitch sign-in expired. Connect again to see who you follow that is live.'),
    ).toBeInTheDocument()
  })

  it('connects when the button is pressed', () => {
    const onConnect = vi.fn()
    render(<SignedOutCard expired={false} onConnect={onConnect} />)

    fireEvent.click(screen.getByRole('button', { name: /connect twitch/ }))

    expect(onConnect).toHaveBeenCalledTimes(1)
  })
})
