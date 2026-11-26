// Uploads the TV page (dist-cast/) to the IONOS webspace with the history server's own SFTP code: password login, refused
// unless the server's host key matches a pinned one, the password never logged. See server/tools/lib/historyDeploy.mjs.
import { readdirSync, statSync } from 'node:fs'
import { join, posix } from 'node:path'
import { passwordFrom, sftpUpload, validateConfig } from '../../server/tools/lib/historyDeploy.mjs'

const REMOTE_DIR = 'PRISM/casting'

function assertShippable(path) {
  const segments = path.split('/')
  const bad =
    /^([A-Za-z]:|\/)/.test(path) ||
    segments.includes('..') ||
    path.endsWith('.map') ||
    segments.some((segment) => segment.startsWith('.') && segment !== '.htaccess')
  if (bad) throw new Error(`will not upload ${path}`)
}

/** Folders parents first, then the files with index.html last: it names the others, so it goes when they are all there. */
export function planCastUpload(files, remoteDir = REMOTE_DIR) {
  const paths = files.map((file) => file.split('\\').join('/'))
  paths.forEach(assertShippable)
  if (!paths.includes('index.html')) throw new Error('the build has no index.html')
  const dirs = new Set()
  for (const path of paths) {
    for (let dir = posix.dirname(path); dir !== '.'; dir = posix.dirname(dir)) dirs.add(posix.join(remoteDir, dir))
  }
  const depth = (dir) => dir.split('/').length
  const ordered = [...paths.filter((path) => path !== 'index.html').sort(), 'index.html']
  return {
    dirs: [...dirs].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b)),
    files: ordered.map((path) => ({ local: path, remote: posix.join(remoteDir, path) })),
  }
}

/** Every file under a folder, as paths relative to it. */
export function listFiles(dir, base = '') {
  return readdirSync(join(dir, base)).flatMap((name) => {
    const path = base ? `${base}/${name}` : name
    return statSync(join(dir, path)).isDirectory() ? listFiles(dir, path) : [path]
  })
}

/** Plans the upload and, with go, does it. A dry run (the default) uploads nothing. */
export async function deployCast({ ssh, files, baseDir, go = false, env = process.env, envFileText = '', log = console.log, upload = sftpUpload }) {
  validateConfig({ ssh })
  const plan = planCastUpload(files)
  for (const file of plan.files) log(`  ${file.remote}`)
  if (!go) {
    log(`DRY RUN: ${plan.files.length} files would go to ${ssh.user}@${ssh.host}:${REMOTE_DIR}. Pass --go to upload.`)
    return
  }
  const password = passwordFrom(env, envFileText)
  if (!password) throw new Error('IONOS_SSH_PASSWORD is not set (in the environment or in .env)')
  await upload({ host: ssh.host, port: ssh.port || 22, user: ssh.user, password, plan, baseDir, hostKeys: ssh.hostKeySha256, log })
  log(`UPLOADED ${plan.files.length} files to ${REMOTE_DIR}`)
}
