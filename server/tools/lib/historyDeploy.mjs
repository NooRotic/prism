// Deploy the history server to the IONOS webspace over password SFTP.
// IONOS shared hosting takes password login only (no panel UI for keys). ssh2 does not check known_hosts the
// way scp does, so the upload refuses to connect unless the server's host key matches a fingerprint pinned in
// deploy.config.json. The password is read from the environment or a gitignored .env and is never logged.
// The pattern follows the owner's IONOS recipe (IONOS-SFTP-DEPLOY.md).
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'

/** The only top-level folders of server/ that go to the host. Everything else (tests, tools, composer, docker) stays. */
const SHIPPED_DIRS = ['src', 'bin', 'migrations', 'public']
const NEVER_SEGMENTS = new Set(['vendor', 'node_modules', 'tests'])
const FINGERPRINT = /^(SHA256:)?[A-Za-z0-9+/]+={0,2}$/

export function validateConfig(cfg) {
  const s = cfg?.ssh ?? {}
  if (!/^[\w.-]+$/.test(s.host || '')) throw new Error('config ssh.host is missing or has unexpected characters')
  if (!/^[\w.-]+$/.test(s.user || '')) throw new Error('config ssh.user is missing or has unexpected characters')
  if (!/^[\w][\w./-]*$/.test(s.remoteDir || '') || s.remoteDir.includes('..') || s.remoteDir.endsWith('/')) {
    throw new Error('config ssh.remoteDir must be a folder such as prism-data (relative to the ssh home, which is the webspace root on IONOS) with no spaces, quotes, .. or leading or trailing slash')
  }
  if (!Array.isArray(s.hostKeySha256) || !s.hostKeySha256.length || !s.hostKeySha256.every((k) => typeof k === 'string' && FINGERPRINT.test(k))) {
    throw new Error('config ssh.hostKeySha256 must be a non-empty list of SHA256 fingerprints such as SHA256:abc... (pin the server host key)')
  }
  if (s.port !== undefined && !(Number.isInteger(s.port) && s.port >= 1 && s.port <= 65535)) {
    throw new Error('config ssh.port must be a whole number from 1 to 65535')
  }
}

/** .env lines are KEY=VALUE; # starts a comment; surrounding quotes are stripped. Only IONOS_SSH_PASSWORD is used. */
export function parseEnv(text) {
  const out = {}
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i < 1) continue
    let v = line.slice(i + 1).trim()
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1)
    out[line.slice(0, i).trim()] = v
  }
  return out
}

/** The environment first, then the .env text; a blank value counts as unset and falls through to the next source. */
export function passwordFrom(env, envFileText) {
  for (const value of [env && env.IONOS_SSH_PASSWORD, parseEnv(envFileText).IONOS_SSH_PASSWORD]) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/** True when the key's SHA-256 (base64, no padding) matches a pinned fingerprint; "SHA256:" and padding are optional. */
export function hostKeyMatches(key, allowed) {
  if (!Array.isArray(allowed) || !allowed.length) return false
  const fingerprint = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return allowed.some((a) => String(a).replace(/^SHA256:/, '').replace(/=+$/, '') === fingerprint)
}

/** Whether a path (relative to server/, posix separators) is part of the deploy. config.php is never part of it. */
function isShipped(path) {
  const segments = path.split('/')
  if (!SHIPPED_DIRS.includes(segments[0])) return false
  const name = segments[segments.length - 1]
  if (name === 'config.php' || name === 'config.example.php') return false
  if (/^install-.*\.php$/.test(name)) return false // generated one-time installers are uploaded by hand, never by the deploy
  if (name.endsWith('.log')) return false
  if (segments.some((s) => NEVER_SEGMENTS.has(s))) return false
  if (segments.some((s) => s.startsWith('.') && s !== '.htaccess')) return false
  return true
}

/** Folders in the order they upload: the classes, migrations and scripts first, the public entry point last. */
const UPLOAD_ORDER = ['src', 'migrations', 'bin', 'public']

/**
 * The upload plan for a list of files relative to server/: directories parents first, then the files. Files go
 * up in UPLOAD_ORDER, so a request that arrives during an upgrade never meets a new front controller with old
 * classes. The deploy only adds and replaces files; a file removed from server/ stays on the host until deleted by hand.
 */
export function planServerUpload(files, remoteDir = 'prism-data') {
  const rank = (path) => UPLOAD_ORDER.indexOf(path.split('/')[0])
  const kept = files
    .map((f) => f.split('\\').join('/'))
    .filter(isShipped)
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
  const dirs = new Set([remoteDir])
  for (const file of kept) {
    let d = posix.dirname(file)
    while (d && d !== '.') {
      dirs.add(posix.join(remoteDir, d))
      d = posix.dirname(d)
    }
  }
  const depth = (d) => d.split('/').length
  return {
    dirs: [...dirs].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)),
    files: kept.map((f) => ({ local: f, remote: posix.join(remoteDir, f) })),
  }
}

/** Every file under the shipped folders of server/, as paths relative to it. Other folders are never walked. */
export function listServerFiles(serverDir) {
  const out = []
  const walk = (rel) => {
    for (const name of readdirSync(join(serverDir, rel))) {
      const next = `${rel}/${name}`
      if (statSync(join(serverDir, next)).isDirectory()) walk(next)
      else out.push(next)
    }
  }
  for (const dir of SHIPPED_DIRS) if (existsSync(join(serverDir, dir))) walk(dir)
  return out
}

async function loadSsh2() {
  const name = 'ssh2'
  try {
    return await import(/* @vite-ignore */ name)
  } catch {
    throw new Error('The ssh2 package is not installed. Install it with: npm install --save-dev ssh2')
  }
}

/** Uploads a plan over SFTP. `deps.Client` replaces ssh2's Client (tests); by default ssh2 is loaded on demand. */
export async function sftpUpload({ host, port, user, password, plan, baseDir, hostKeys, log = console.log }, deps = {}) {
  if (!Array.isArray(hostKeys) || !hostKeys.length) {
    throw new Error('ssh.hostKeySha256 is missing: pin the server host key before using password SFTP')
  }
  const Client = deps.Client ?? (await loadSsh2()).Client
  const conn = new Client()
  await new Promise((resolve, reject) => {
    conn
      .once('ready', resolve)
      .once('error', (e) => reject(e?.level === 'client-authentication' ? new Error('SSH login failed: the password was rejected') : new Error(`SSH connection failed: ${e?.message ?? 'unknown error'}`)))
    conn.connect({ host, port, username: user, password, readyTimeout: 30000, hostVerifier: (key) => hostKeyMatches(key, hostKeys) })
  })
  try {
    const sftp = await new Promise((res, rej) => conn.sftp((e, s) => (e ? rej(e) : res(s))))
    const call = (fn, ...a) => new Promise((res, rej) => fn.call(sftp, ...a, (e, r) => (e ? rej(e) : res(r))))
    for (const d of plan.dirs) {
      try {
        await call(sftp.mkdir, d)
      } catch {
        // the folder already exists
      }
    }
    let n = 0
    for (const f of plan.files) {
      await call(sftp.fastPut, join(baseDir, f.local), f.remote)
      n += 1
    }
    log(`  uploaded ${n} files over SFTP`)
  } finally {
    conn.end()
  }
}

/** Plans the upload and, with go, does it. A dry run (the default) uploads nothing. */
export async function deploy({
  config,
  serverDir,
  go,
  env = process.env,
  envFileText = '',
  log = console.log,
  upload = sftpUpload,
  listFiles = listServerFiles,
}) {
  validateConfig(config)
  const { host, user, remoteDir } = config.ssh
  const port = config.ssh.port || 22
  const plan = planServerUpload(listFiles(serverDir), remoteDir)
  plan.files.forEach((f) => log(`  ${f.remote}`))

  if (!go) {
    log(`DRY RUN: ${plan.files.length} files would go to ${user}@${host}:${remoteDir} (port ${port}). Pass --go to deploy.`)
    return plan
  }
  const password = passwordFrom(env, envFileText)
  if (!password) throw new Error('IONOS_SSH_PASSWORD is not set (in the environment or in the .env file)')

  await upload({ host, port, user, password, plan, baseDir: serverDir, hostKeys: config.ssh.hostKeySha256, log })
  log(`DEPLOYED ${plan.files.length} files to ${remoteDir}`)
  return plan
}
