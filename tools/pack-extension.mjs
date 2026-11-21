// Packs the PRISM helper extension into dist-extension/prism-helper-<version>.zip: the file the Chrome Web Store takes,
// and a copy that can be unzipped into a folder and loaded unpacked in any Chrome profile.
// Usage: node tools/pack-extension.mjs   (or: pnpm run pack:extension)
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'extension')
const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'))
const outDir = join(root, 'dist-extension')
const staging = join(outDir, 'staging')
const zip = join(outDir, `prism-helper-${manifest.version}.zip`)

// The extension itself only: no README, no package.json (they are for people and for Node, not for Chrome).
const include = ['manifest.json', 'background.js', 'content.js', 'handoff.js', 'icons']
for (const f of include) {
  if (!existsSync(join(src, f))) throw new Error(`extension/${f} is missing`)
}
for (const size of Object.keys(manifest.icons)) {
  if (!existsSync(join(src, manifest.icons[size]))) throw new Error(`icon ${manifest.icons[size]} is missing`)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })
for (const f of include) cpSync(join(src, f), join(staging, f), { recursive: true })

if (process.platform === 'win32') {
  // Not Compress-Archive: Windows PowerShell 5.1 writes backslashes in the entry names, which other systems (and the
  // Web Store) do not accept. This writes each entry with forward slashes.
  const script = [
    'Add-Type -AssemblyName System.IO.Compression',
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$root = '${staging}'`,
    `$zip = [System.IO.Compression.ZipFile]::Open('${zip}', 'Create')`,
    'Get-ChildItem -Path $root -Recurse -File | ForEach-Object {',
    "  $name = $_.FullName.Substring($root.Length + 1).Replace('\\', '/')",
    '  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $name)',
    '}',
    '$zip.Dispose()',
  ].join('; ')
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'inherit' })
} else {
  execFileSync('zip', ['-r', '-q', zip, '.'], { cwd: staging, stdio: 'inherit' })
}
rmSync(staging, { recursive: true, force: true })
console.log(`Packed ${zip}`)
console.log(`Files: ${include.join(', ')} (icons: ${readdirSync(join(src, 'icons')).length})`)
