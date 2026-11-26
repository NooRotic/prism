// The read-back draws each style to pixels the way the TV shows it, and reads it as a phone camera would.
import { Resvg } from '@resvg/resvg-js'
import jsQR from 'jsqr'
import { renderToStaticMarkup } from 'react-dom/server'
import QrCode from '../../../components/cast/QrCode'
import { DEFAULT_QR_STYLE, isQrStyle, QR_STYLES, qrModel, shareUrl, type QrStyle } from '../qrCode'

const IDS = ['5a75dc06710d', '0f1e2d3c4b5a', 'bbb-hls']

function readBack(id: string, style: QrStyle): string | null {
  const svg = renderToStaticMarkup(<QrCode text={shareUrl(id)} styleName={style} />)
  const image = new Resvg(svg, { fitTo: { mode: 'width', value: 400 }, background: '#6a7a8a' }).render()
  return jsQR(new Uint8ClampedArray(image.pixels), image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
}

it.each(QR_STYLES.flatMap((style) => IDS.map((id) => [style, id] as const)))('style %s reads back as the link to %s', (style, id) => {
  expect(readBack(id, style)).toBe(shareUrl(id))
})

it('links to the channel page by id only', () => {
  expect(shareUrl('a b/c')).toBe('https://prism.nooroticx.tv/hls-dash/a%20b%2Fc')
})

it('knows its styles, and B is the default', () => {
  expect(QR_STYLES).toEqual(['a', 'b', 'c'])
  expect(DEFAULT_QR_STYLE).toBe('b')
  expect([isQrStyle('a'), isQrStyle('d'), isQrStyle(null)]).toEqual([true, false, false])
})

it('keeps the corner squares and the middle out of the dots', () => {
  const model = qrModel(shareUrl('5a75dc06710d'))
  expect(model.dots.some(([x, y]) => x < 7 && y < 7)).toBe(false)
  const { at, span } = model.hole
  expect(model.dots.some(([x, y]) => x >= at && x < at + span && y >= at && y < at + span)).toBe(false)
})

it('gives two codes on one page their own gradients', () => {
  const page = renderToStaticMarkup(
    <>
      <QrCode text={shareUrl('a')} styleName="a" />
      <QrCode text={shareUrl('b')} styleName="b" />
    </>,
  )
  const ids = [...page.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1])
  expect(ids).toHaveLength(2)
  expect(new Set(ids).size).toBe(2)
})
