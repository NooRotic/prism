import qrcode from 'qrcode-generator'

/**
 * The QR code the TV shows for the channel that is on, and its three looks. The owner chooses the look in /admin; the TV and
 * the admin screen draw it from this one module (`components/cast/QrCode.tsx`), so what the owner sees is what the TV shows.
 */
export type QrStyle = 'a' | 'b' | 'c'

export const QR_STYLES: readonly QrStyle[] = ['a', 'b', 'c']

/** Rainbow on dark: the owner's pick, read by his phone's camera. */
export const DEFAULT_QR_STYLE: QrStyle = 'b'

export function isQrStyle(value: unknown): value is QrStyle {
  return value === 'a' || value === 'b' || value === 'c'
}

/** The channel's page in PRISM: only ever its id, never the stream's address (it can carry a token). */
export function shareUrl(id: string): string {
  return `https://prism.nooroticx.tv/hls-dash/${encodeURIComponent(id)}`
}

export interface QrLook {
  /** The card the code sits on. */
  card: string
  /** The dots' colours, across the code from top left to bottom right. */
  stops: string[]
  /** The three corner squares: top left, top right, bottom left. */
  eyes: [string, string, string]
}

export const QR_LOOKS: Record<QrStyle, QrLook> = {
  // PRISM's colours, deepened so a camera still sees strong contrast on the light card.
  a: { card: '#f4f4f8', stops: ['#5b21b6', '#1e40af', '#9f1239'], eyes: ['#5b21b6', '#1e40af', '#9f1239'] },
  // Light rainbow dots on near-black: most like the TV page.
  b: { card: '#050507', stops: ['#c4b5fd', '#93c5fd', '#86efac', '#fde68a', '#fca5a5'], eyes: ['#c4b5fd', '#93c5fd', '#fca5a5'] },
  // Near-black dots, colour only in the corners: the safest to scan.
  c: { card: '#f4f4f8', stops: ['#141420'], eyes: ['#9146ff', '#3b82f6', '#ff0000'] },
}

export interface QrModel {
  /** Modules along a side, without the quiet zone. */
  size: number
  /** Empty modules round the code on each side. */
  quiet: number
  /** Dark modules to draw as dots, `[x, y]` in modules from the code's top left; the corners and the middle are not here. */
  dots: Array<[number, number]>
  /** The three corner squares' top left corners, drawn as squares of their own. */
  eyes: Array<[number, number]>
  /** The square in the middle left for PRISM's mark: from `at` to `at + span` on both axes. */
  hole: { at: number; span: number }
}

const QUIET = 4
const EYE = 7
/** The middle's share of the side. The highest error correction recovers up to about a third of the code. */
const HOLE_SHARE = 0.22

export function qrModel(text: string): QrModel {
  const qr = qrcode(0, 'H')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  // Both odd, so the hole sits exactly in the middle.
  const span = Math.floor(size * HOLE_SHARE) | 1
  const at = (size - span) / 2
  const corner = (x: number, y: number) => (x < EYE && y < EYE) || (x >= size - EYE && y < EYE) || (x < EYE && y >= size - EYE)
  const middle = (x: number, y: number) => x >= at && x < at + span && y >= at && y < at + span
  const dots: Array<[number, number]> = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.isDark(y, x) && !corner(x, y) && !middle(x, y)) dots.push([x, y])
    }
  }
  return { size, quiet: QUIET, dots, eyes: [[0, 0], [size - EYE, 0], [0, size - EYE]], hole: { at, span } }
}
