import { render, screen } from '@testing-library/react'
import FallbackCard from '../FallbackCard'
import type { URLDetectionResult } from '../../../lib/urlDetection'

const hls: URLDetectionResult = { type: 'hls', originalUrl: 'https://h.test/a.m3u8?token=abc', playableUrl: 'https://h.test/a.m3u8?token=abc' }

describe('FallbackCard', () => {
  it('shows the reason, with no query value or login of any address in it', () => {
    render(<FallbackCard detection={hls} error="Failed loading https://user:pw@h.test/a.m3u8?token=abc123, giving up" />)

    const text = screen.getByText(/Failed loading/).textContent ?? ''
    expect(text).toContain('https://***@h.test/a.m3u8?token=***')
    expect(text).not.toContain('abc123')
    expect(text).not.toContain('pw@')
  })

  it('shows a reason with no address as it is', () => {
    render(<FallbackCard detection={hls} error="Stream unavailable" />)

    expect(screen.getByText('Stream unavailable')).toBeInTheDocument()
  })
})
