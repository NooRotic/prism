import { SECTIONS, sectionForPath, showsHeaderPaste } from '../headerSections'

describe('sectionForPath', () => {
  it.each([
    ['/', null],
    ['/twitch', 'twitch'],
    ['/twitch/foo', 'twitch'],
    ['/twitchy', null],
    ['/youtube', 'youtube'],
    ['/youtube/catchup', 'youtube'],
    ['/hls-dash', 'hls-dash'],
    ['/hls-dash/0123456789ab', 'hls-dash'],
    ['/nope', null],
  ])('puts %s in %s', (path, section) => {
    expect(sectionForPath(path)).toBe(section)
  })
})

describe('showsHeaderPaste', () => {
  it.each([['/hls-dash'], ['/hls-dash/'], ['/hls-dash/0123456789ab'], ['/hls-dash/custom'], ['/twitch/streamer'], ['/youtube/abc'], ['/youtube/catchup'], ['/nope']])(
    'shows it on %s',
    (path) => {
      expect(showsHeaderPaste(path)).toBe(true)
    },
  )

  it.each([['/'], ['/twitch'], ['/youtube']])('leaves it to the page on %s', (path) => {
    expect(showsHeaderPaste(path)).toBe(false)
  })
})

describe('SECTIONS', () => {
  it('lists Twitch, YouTube and HLS/DASH in that order, with tools for the first two', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(['Twitch', 'YouTube', 'HLS/DASH'])
    expect(SECTIONS.map((s) => s.path)).toEqual(['/twitch', '/youtube', '/hls-dash'])
    expect(SECTIONS.map((s) => s.hasTools)).toEqual([true, true, false])
    expect(SECTIONS.find((s) => s.id === 'hls-dash')?.shortLabel).toBe('HLS')
  })

  it('uses each protocol colour', () => {
    expect(SECTIONS.map((s) => s.color)).toEqual(['var(--accent-twitch)', 'var(--accent-youtube)', 'var(--accent-hls)'])
  })
})
