import {
  DEMO_CONTENT,
  getDemoByProtocol,
  getDemoById,
  getHlsDashDemo,
  PROTOCOL_META,
} from '../demoContent'

describe('demoContent', () => {
  describe('DEMO_CONTENT', () => {
    it('has entries for all four protocols', () => {
      const protocols = new Set(DEMO_CONTENT.map((e) => e.protocol))
      expect(protocols).toContain('twitch')
      expect(protocols).toContain('youtube')
      expect(protocols).toContain('hls')
      expect(protocols).toContain('dash')
    })

    it('every entry has a unique id', () => {
      const ids = DEMO_CONTENT.map((e) => e.id)
      expect(new Set(ids).size).toBe(ids.length)
    })

    it('every entry has required fields', () => {
      for (const entry of DEMO_CONTENT) {
        expect(entry.id).toBeTruthy()
        expect(entry.label).toBeTruthy()
        expect(entry.protocol).toBeTruthy()
        expect(entry.url).toBeTruthy()
      }
    })

    it('has at least one featured entry', () => {
      expect(DEMO_CONTENT.some((e) => e.featured)).toBe(true)
    })
  })

  describe('getDemoByProtocol', () => {
    it('returns only twitch entries for twitch', () => {
      const entries = getDemoByProtocol('twitch')
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every((e) => e.protocol === 'twitch')).toBe(true)
    })

    it('returns only youtube entries for youtube', () => {
      const entries = getDemoByProtocol('youtube')
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every((e) => e.protocol === 'youtube')).toBe(true)
    })
  })

  describe('getDemoById', () => {
    it('finds an existing entry', () => {
      const entry = getDemoById('hasanabi')
      expect(entry).toBeDefined()
      expect(entry!.protocol).toBe('twitch')
    })

    it('returns undefined for non-existent id', () => {
      expect(getDemoById('nonexistent')).toBeUndefined()
    })
  })

  describe('getHlsDashDemo', () => {
    it('returns both HLS and DASH entries', () => {
      const entries = getHlsDashDemo()
      const protocols = new Set(entries.map((e) => e.protocol))
      expect(protocols).toContain('hls')
      expect(protocols).toContain('dash')
      expect(protocols.size).toBe(2)
    })
  })

  describe('PROTOCOL_META', () => {
    it('has metadata for all three protocol keys', () => {
      expect(PROTOCOL_META.twitch).toBeDefined()
      expect(PROTOCOL_META.youtube).toBeDefined()
      expect(PROTOCOL_META['hls-dash']).toBeDefined()
    })

    it('each meta has label, color, and description', () => {
      for (const key of ['twitch', 'youtube', 'hls-dash'] as const) {
        const meta = PROTOCOL_META[key]
        expect(meta.label).toBeTruthy()
        expect(meta.color).toBeTruthy()
        expect(meta.description).toBeTruthy()
      }
    })
  })
})
