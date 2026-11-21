import { describe, expect, it } from 'vitest'
import manifestRaw from '../../../extension/manifest.json?raw'

// Vite reads the extension folder for us, so the test needs no Node file APIs: the keys are the files that exist.
const files = Object.keys(
  import.meta.glob(['../../../extension/*.js', '../../../extension/icons/*.png'], { query: '?url', import: 'default' }),
).map((k) => k.replace('../../../extension/', ''))
const manifest = JSON.parse(manifestRaw)

describe('extension manifest (what Chrome and the Web Store check)', () => {
  it('is Manifest V3 with a name, a description under the store limit and a dotted version', () => {
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.name).toBeTruthy()
    expect(manifest.description.length).toBeLessThanOrEqual(132)
    expect(manifest.version).toMatch(/^\d+(\.\d+){1,3}$/)
  })

  it('has every icon it names, at the sizes the store needs', () => {
    expect(Object.keys(manifest.icons).sort()).toEqual(['128', '16', '32', '48'])
    for (const file of [...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)] as string[]) {
      expect(files, file).toContain(file)
    }
  })

  it('names files that exist: the worker and the content scripts', () => {
    expect(files).toContain(manifest.background.service_worker)
    for (const script of manifest.content_scripts.flatMap((c: { js: string[] }) => c.js)) {
      expect(files, script).toContain(script)
    }
  })

  it('asks for the least it needs: the right-click menu and the current tab, no host access, no broad tabs access', () => {
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'contextMenus'])
    expect(manifest.host_permissions).toBeUndefined()
    expect(manifest.permissions).not.toContain('tabs')
  })

  it('only injects into the two pages it reads (Twitch, and the Watch Later playlist)', () => {
    expect(manifest.content_scripts.flatMap((c: { matches: string[] }) => c.matches).sort()).toEqual([
      'https://www.twitch.tv/*',
      'https://www.youtube.com/playlist*',
    ])
  })
})
