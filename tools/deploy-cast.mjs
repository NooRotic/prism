// Build the TV page and upload it to https://prism-cast.nooroticx.tv. Dry run unless --go is passed.
//   node tools/deploy-cast.mjs          (builds, lists what would be uploaded)
//   node tools/deploy-cast.mjs --go     (builds and uploads)
// It only adds and replaces files. The password (IONOS_SSH_PASSWORD) comes from the environment or .env and is never printed;
// the server and its pinned host keys come from server/deploy.config.json (gitignored).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deployCast, listFiles } from './lib/castDeploy.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')

try {
  execFileSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.cast.config.ts'], { cwd: root, stdio: 'inherit' })
  const baseDir = join(root, 'dist-cast')
  await deployCast({
    ssh: JSON.parse(readFileSync(join(root, 'server/deploy.config.json'), 'utf8')).ssh,
    files: listFiles(baseDir),
    baseDir,
    go: process.argv.includes('--go'),
    envFileText: read(join(root, '.env')),
  })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
