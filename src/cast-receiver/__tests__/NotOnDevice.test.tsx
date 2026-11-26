import { render, screen } from '@testing-library/react'
import NotOnDevice from '../NotOnDevice'

it('says what this page is and links to the help page', () => {
  render(<NotOnDevice />)
  expect(screen.getByText("This is PRISM's TV page. It runs when you cast PRISM to a TV")).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'What is PRISM?' })).toHaveAttribute('href', '/')
})

it('on a Cast device whose player did not load, asks to cast again', () => {
  render(<NotOnDevice failed />)
  expect(screen.getByText("Google's Cast player did not load. Cast PRISM to this TV again.")).toBeInTheDocument()
  expect(screen.queryByRole('link')).toBeNull()
})
