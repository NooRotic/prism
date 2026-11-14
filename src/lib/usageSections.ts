/**
 * The parts of PRISM a page open is counted under. The list is closed and must match the history server's
 * `Usage\Sections::ALL`: the server rejects anything else, which keeps its counter table tiny.
 */
export const USAGE_SECTIONS = ['home', 'twitch', 'youtube', 'hls-dash', 'chat-popout', 'other'] as const

export type UsageSection = (typeof USAGE_SECTIONS)[number]
