import { videoFamily } from './renditionGuard'

/** [label shown, media type, codec string]: what the report asks the browser about. */
const CODEC_TABLE: ReadonlyArray<readonly [string, string, string]> = [
  ['H.264', 'video/mp4', 'avc1.64001f'],
  ['HEVC', 'video/mp4', 'hvc1.2.4.L123.B0'],
  ['Dolby Vision', 'video/mp4', 'dvh1.05.06'],
  ['AV1', 'video/mp4', 'av01.0.05M.08'],
  ['VP9', 'video/mp4', 'vp09.00.10.08'],
  ['AAC', 'audio/mp4', 'mp4a.40.2'],
  ['HE-AAC', 'audio/mp4', 'mp4a.40.5'],
  ['AC-3', 'audio/mp4', 'ac-3'],
  ['EC-3', 'audio/mp4', 'ec-3'],
  ['Opus', 'audio/mp4', 'opus'],
]

/**
 * What this browser says about itself and about decoding, for the playback report. "Says" is the word: the table is the
 * answer to `MediaSource.isTypeSupported`, and a codec can be listed as supported and still fail to decode on a given
 * machine (that is what the rendition fallback is for). Never throws.
 */
export function collectEnvironment(): Record<string, unknown> {
  const source = typeof MediaSource === 'undefined' ? undefined : MediaSource
  const codecs: Record<string, boolean | 'error'> = {}
  for (const [label, type, codec] of CODEC_TABLE) {
    if (!source || typeof source.isTypeSupported !== 'function') {
      codecs[label] = false
      continue
    }
    try {
      codecs[label] = source.isTypeSupported(`${type}; codecs="${codec}"`)
    } catch {
      codecs[label] = 'error'
    }
  }
  return {
    userAgent: typeof navigator === 'undefined' ? '(unknown)' : navigator.userAgent,
    language: typeof navigator === 'undefined' ? '(unknown)' : navigator.language,
    devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
    viewport: typeof window === 'undefined' ? [0, 0] : [window.innerWidth, window.innerHeight],
    mediaSource: Boolean(source),
    codecs,
  }
}

/**
 * One line from `navigator.mediaCapabilities.decodingInfo` for a CODECS string such as `hvc1.2.4,mp4a.40.2`: whether the
 * browser thinks it can decode it, and whether that would be smooth and power efficient. Never rejects.
 */
export async function describeDecoding(codecs: string, size: { width: number; height: number } = { width: 1280, height: 720 }): Promise<string> {
  const capabilities = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { mediaCapabilities?: MediaCapabilities }).mediaCapabilities
  if (!capabilities || typeof capabilities.decodingInfo !== 'function') return 'MediaCapabilities is not available in this browser'
  const tokens = codecs.split(',').map((token) => token.trim()).filter(Boolean)
  const video = tokens.find((token) => videoFamily(token) !== null)
  if (video === undefined) return `MediaCapabilities: no video codec to ask about in "${codecs}"`
  const audio = tokens.find((token) => token !== video)
  try {
    const info = await capabilities.decodingInfo({
      type: 'media-source',
      video: { contentType: `video/mp4; codecs="${video}"`, width: size.width, height: size.height, bitrate: 2_000_000, framerate: 24 },
      ...(audio === undefined ? {} : { audio: { contentType: `audio/mp4; codecs="${audio}"` } }),
    })
    return `MediaCapabilities: ${codecs} at ${size.width}x${size.height}: supported=${info.supported} smooth=${info.smooth} powerEfficient=${info.powerEfficient}`
  } catch (error) {
    return `MediaCapabilities check failed: ${error instanceof Error ? error.message : String(error)}`
  }
}
