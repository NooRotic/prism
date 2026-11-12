import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { listServerFiles } from '../lib/historyDeploy.mjs'

// git matches ignore patterns case-insensitively on Windows and macOS (core.ignorecase), so the private
// `config.php` rule once swallowed `src/Config.php`, the settings class, and it never reached the repository.
// These tests ask git itself, so they catch that on the machines where it can happen.

// A string URL, not `new URL(...)`: the jsdom test environment replaces the URL class with one Node rejects.
const here = dirname(fileURLToPath(import.meta.url))
const serverDir = resolve(here, '../..')
const repoRoot = resolve(serverDir, '..')

/** Paths (relative to the repository root) that git would ignore. */
function ignoredAmong(paths) {
  const run = spawnSync('git', ['check-ignore', '--stdin'], { cwd: repoRoot, input: paths.join('\n'), encoding: 'utf8' })
  // Exit 0 = some ignored, 1 = none ignored; anything else means git itself failed.
  if (run.status !== 0 && run.status !== 1) throw new Error(`git check-ignore failed (${run.status}): ${run.stderr}`)
  return run.stdout.split(/\r?\n/).filter(Boolean)
}

describe('server files and git', () => {
  it('does not ignore the Config class that reads the private settings file', () => {
    expect(ignoredAmong(['server/src/Config.php'])).toEqual([])
  })

  it('still ignores the private config.php that holds the secrets', () => {
    expect(ignoredAmong(['server/config.php'])).toEqual(['server/config.php'])
  })

  it('ignores nothing that the deploy would ship, so a fresh clone deploys the same files', () => {
    const shipped = listServerFiles(serverDir).map((f) => `server/${f}`)
    expect(shipped.length).toBeGreaterThan(30)
    expect(ignoredAmong(shipped)).toEqual([])
  })
})
