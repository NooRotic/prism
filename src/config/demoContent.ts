export type DemoProtocol = 'twitch' | 'youtube' | 'hls' | 'dash'

export interface DemoEntry {
  id: string
  label: string
  description?: string
  protocol: DemoProtocol
  url: string
  thumbnail?: string
  featured?: boolean
}

export const DEMO_CONTENT: DemoEntry[] = [
  // Twitch — public channels (no auth needed for profile/live status)
  { id: 'hasanabi', label: 'hasanabi', protocol: 'twitch', url: 'hasanabi', featured: true, description: 'Politics & Just Chatting' },
  { id: 'carter', label: 'carter', protocol: 'twitch', url: 'carter', description: 'Variety & Entertainment' },
  { id: 'audrareins', label: 'AudraReins', protocol: 'twitch', url: 'AudraReins', description: 'Creative & Just Chatting' },
  { id: 'xqc', label: 'xQc', protocol: 'twitch', url: 'xqc', description: 'Variety Gaming' },
  { id: 'kaicenat', label: 'Kai Cenat', protocol: 'twitch', url: 'kaicenat', featured: true, description: 'Entertainment & IRL' },
  { id: 'shroud', label: 'shroud', protocol: 'twitch', url: 'shroud', description: 'FPS & Competitive' },

  // YouTube — hardcoded video IDs
  { id: 'yt-1', label: 'YouTube Demo 1', protocol: 'youtube', url: 'https://youtu.be/RBuinr1g8h4', featured: true },
  { id: 'yt-2', label: 'YouTube Demo 2', protocol: 'youtube', url: 'https://www.youtube.com/watch?v=9JykA28EoTg' },
  { id: 'yt-3', label: 'YouTube Demo 3', protocol: 'youtube', url: 'https://www.youtube.com/watch?v=fQGbXmkSArs' },

  // HLS — public test streams (always available)
  { id: 'apple-basic', label: 'Apple HLS Basic', protocol: 'hls', url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8', description: '16:9 multi-bitrate' },
  { id: 'apple-4k', label: 'Apple 4K HEVC', protocol: 'hls', url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/adv_dv_atmos/main.m3u8', featured: true, description: 'Dolby Vision + Atmos' },
  { id: 'bbb-hls', label: 'Big Buck Bunny', protocol: 'hls', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', description: 'Mux test stream' },

  // DASH — public test manifests
  { id: 'dash-bbb', label: 'Big Buck Bunny DASH', protocol: 'dash', url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd', featured: true, description: 'Akamai 30fps reference' },
  { id: 'dash-envivio', label: 'Envivio DASH', protocol: 'dash', url: 'https://dash.akamaized.net/envivio/EnvisioTVDVBTest/manifest.mpd', description: 'DVB test manifest' },
]

export function getDemoByProtocol(protocol: DemoProtocol): DemoEntry[] {
  return DEMO_CONTENT.filter((e) => e.protocol === protocol)
}

export function getDemoById(id: string): DemoEntry | undefined {
  return DEMO_CONTENT.find((e) => e.id === id)
}

/** For HLS/DASH, group them together as one "protocol" */
export function getHlsDashDemo(): DemoEntry[] {
  return DEMO_CONTENT.filter((e) => e.protocol === 'hls' || e.protocol === 'dash')
}

export const PROTOCOL_META = {
  twitch: { label: 'Twitch', color: 'var(--accent-twitch)', description: 'Live streams, clips, VODs' },
  youtube: { label: 'YouTube', color: 'var(--accent-youtube)', description: 'Video playback via react-player' },
  'hls-dash': { label: 'HLS / DASH', color: 'var(--accent-hls)', description: 'Adaptive streaming protocols' },
} as const

export type ProtocolKey = keyof typeof PROTOCOL_META
