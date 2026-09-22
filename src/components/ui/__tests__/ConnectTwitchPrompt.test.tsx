import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConnectTwitchPrompt from '../ConnectTwitchPrompt'
import ConnectTwitchButton from '../ConnectTwitchButton'

describe('ConnectTwitchButton', () => {
  it('renders the shared lowercase label', () => {
    render(<ConnectTwitchButton onClick={() => {}} />)
    expect(screen.getByRole('button', { name: /connect twitch/i })).toBeInTheDocument()
  })

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(<ConnectTwitchButton onClick={onClick} />)
    await user.click(screen.getByRole('button', { name: /connect twitch/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('stretches to full width when asked', () => {
    render(<ConnectTwitchButton onClick={() => {}} fullWidth />)
    expect(screen.getByRole('button', { name: /connect twitch/i })).toHaveClass('w-full')
  })
})

describe('ConnectTwitchPrompt', () => {
  it('renders the title and description it is given', () => {
    render(
      <ConnectTwitchPrompt
        title="Your Favorites"
        description="Connect Twitch to see your followed channels"
        onConnect={() => {}}
      />,
    )
    expect(screen.getByText('Your Favorites')).toBeInTheDocument()
    expect(
      screen.getByText('Connect Twitch to see your followed channels'),
    ).toBeInTheDocument()
  })

  it('wires the button to onConnect', async () => {
    const onConnect = vi.fn()
    const user = userEvent.setup()
    render(<ConnectTwitchPrompt title="T" description="D" onConnect={onConnect} />)
    await user.click(screen.getByRole('button', { name: /connect twitch/i }))
    expect(onConnect).toHaveBeenCalledTimes(1)
  })
})
