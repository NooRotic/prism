/**
 * Chrome's document picture-in-picture window API (Chrome and Edge 116+). It is
 * not in every TypeScript DOM library yet, so the part PRISM uses is declared
 * here. A global declaration file: no imports or exports.
 */
interface DocumentPictureInPictureOptions {
  width?: number
  height?: number
  disallowReturnToOpener?: boolean
  preferInitialWindowPlacement?: boolean
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>
  readonly window: Window | null
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture
}
