// Deploy the history server to the IONOS webspace. Dry run unless --go is passed.
//   node server/tools/deploy.mjs                 (lists what would be uploaded)
//   node server/tools/deploy.mjs --go            (uploads it)
// Options: --config <file> (default server/deploy.config.json), --env-file <file> (default server/.env).
// The password (IONOS_SSH_PASSWORD) comes from the environment or the env file, and is never printed.
// This deploy never uploads, reads or overwrites /prism-data/config.php: the owner creates that file on the host.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deploy } from './lib/historyDeploy.mjs'

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function option(args, name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : fallback
}

async function main() {
  const args = process.argv.slice(2)
  const configPath = option(args, '--config', join(serverDir, 'deploy.config.json'))
  const envPath = option(args, '--env-file', join(serverDir, '.env'))
  if (!existsSync(configPath)) throw new Error('deploy.config.json not found: copy server/deploy.config.example.json and fill it in')

  await deploy({
    config: JSON.parse(readFileSync(configPath, 'utf8')),
    serverDir,
    go: args.includes('--go'),
    envFileText: existsSync(envPath) ? readFileSync(envPath, 'utf8') : '',
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message)
    process.exitCode = 1
  })
}
