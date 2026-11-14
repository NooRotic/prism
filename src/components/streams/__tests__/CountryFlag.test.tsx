import { render } from '@testing-library/react'
import CountryFlag from '../CountryFlag'

describe('CountryFlag', () => {
  it('draws the bundled flag for a known code, as a picture with no text alternative', () => {
    const { container } = render(<CountryFlag code="us" />)

    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toMatch(/us\.svg|^data:image\/svg/)
    expect(img?.getAttribute('alt')).toBe('')
  })

  it('has the United Kingdom under gb, the code the server maps uk to', () => {
    const { container } = render(<CountryFlag code="gb" />)

    expect(container.querySelector('img')?.getAttribute('src')).toMatch(/gb\.svg|^data:image\/svg/)
  })

  it('accepts an upper-case code', () => {
    const { container } = render(<CountryFlag code="FR" />)

    expect(container.querySelector('img')).not.toBeNull()
  })

  it.each([['zz'], ['xx'], ['usa'], ['u'], [''], ['../x'], ['us/../gb']])('draws nothing for %j', (code) => {
    const { container } = render(<CountryFlag code={code} />)

    expect(container.firstChild).toBeNull()
  })

  it('draws nothing for no country', () => {
    const { container } = render(<CountryFlag code={null} />)

    expect(container.firstChild).toBeNull()
  })

  it('sizes the flag by its width, keeping the 4 to 3 shape', () => {
    const { container } = render(<CountryFlag code="de" size={24} />)

    const img = container.querySelector('img')
    expect(img?.getAttribute('width')).toBe('24')
    expect(img?.getAttribute('height')).toBe('18')
  })

  it('loads lazily and sends no referrer', () => {
    const { container } = render(<CountryFlag code="it" />)

    const img = container.querySelector('img')
    expect(img?.getAttribute('loading')).toBe('lazy')
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer')
  })
})
