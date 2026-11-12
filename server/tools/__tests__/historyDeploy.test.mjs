import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  deploy,
  hostKeyMatches,
  listServerFiles,
  parseEnv,
  passwordFrom,
  planServerUpload,
  sftpUpload,
  validateConfig,
} from '../lib/historyDeploy.mjs'

const FAKE_KEY = Buffer.from('fake-host-key-bytes')
const FAKE_FINGERPRINT = createHash('sha256').update(FAKE_KEY).digest('base64').replace(/=+$/, '')

const goodConfig = () => ({
  ssh: { host: 'access.example.invalid', user: 'u123', port: 22, hostKeySha256: [`SHA256:${FAKE_FINGERPRINT}`], remoteDir: 'prism-data' },
})

/** A stand-in for ssh2's Client: records what is asked of it and obeys the host key check. */
class FakeClient extends EventEmitter {
  static instances = []
  constructor() {
    super()
    this.mkdirs = []
    this.puts = []
    this.ended = false
    FakeClient.instances.push(this)
  }
  connect(options) {
    this.options = options
    const trusted = options.hostVerifier ? options.hostVerifier(FAKE_KEY) : true
    setImmediate(() => (trusted ? this.emit('ready') : this.emit('error', new Error('Host denied (verification failed)'))))
  }
  sftp(callback) {
    callback(undefined, {
      mkdir: (path, done) => { this.mkdirs.push(path); done(null) },
      fastPut: (local, remote, done) => { this.puts.push([local, remote]); done(null) },
    })
  }
  end() { this.ended = true }
}

const tempDirs = []
afterEach(() => {
  FakeClient.instances = []
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true })
})

describe('planServerUpload', () => {
  const everything = [
    'src/Config.php', 'src/Api/Router.php', 'bin/install.php', 'migrations/001_schema.sql',
    'public/index.php', 'public/.htaccess', 'public/install-abc123.php',
    'config.php', 'config.example.php', 'src/config.php', 'tests/SmokeTest.php', 'vendor/autoload.php',
    'composer.json', 'composer.lock', 'phpunit.xml', 'Dockerfile.test', 'docker-compose.test.yml',
    'tools/deploy.mjs', 'README.md', '.gitignore', '.env', 'public/.env', 'src/.hidden.php', '.phpunit.cache/x', 'history.log', 'src/debug.log',
  ]

  it('never contains config.php even when it exists locally', () => {
    const remotes = planServerUpload(everything).files.map((f) => f.remote)
    expect(remotes.some((r) => r.endsWith('config.php'))).toBe(false)
    expect(remotes.some((r) => r.endsWith('config.example.php'))).toBe(false)
  })

  it('excludes tests, vendor, tools, composer files and docker files', () => {
    const remotes = planServerUpload(everything).files.map((f) => f.remote)
    for (const banned of ['tests', 'vendor', 'tools', 'composer', 'phpunit', 'Dockerfile', 'docker-compose', 'README', '.gitignore', '.env', '.phpunit.cache', '.log', 'install-']) {
      expect(remotes.some((r) => r.includes(banned)), banned).toBe(false)
    }
  })

  it('ships exactly the service code, migrations and the public folder, htaccess included', () => {
    expect([...planServerUpload(everything).files.map((f) => f.local)].sort()).toEqual([
      'bin/install.php',
      'migrations/001_schema.sql',
      'public/.htaccess',
      'public/index.php',
      'src/Api/Router.php',
      'src/Config.php',
    ])
  })

  it('uploads the classes first and the public folder last, so a request during an upgrade never meets a new controller with old classes', () => {
    expect(planServerUpload(everything).files.map((f) => f.local)).toEqual([
      'src/Api/Router.php',
      'src/Config.php',
      'migrations/001_schema.sql',
      'bin/install.php',
      'public/.htaccess',
      'public/index.php',
    ])
  })

  it('sends public files under prism-data/public and src under prism-data/src', () => {
    const remotes = planServerUpload(everything).files.map((f) => f.remote)
    expect(remotes).toContain('prism-data/public/index.php')
    expect(remotes).toContain('prism-data/public/.htaccess')
    expect(remotes).toContain('prism-data/src/Config.php')
    expect(remotes).toContain('prism-data/bin/install.php')
    expect(remotes).toContain('prism-data/migrations/001_schema.sql')
  })

  it('lists directories parents first', () => {
    expect(planServerUpload(everything).dirs).toEqual([
      'prism-data',
      'prism-data/bin',
      'prism-data/migrations',
      'prism-data/public',
      'prism-data/src',
      'prism-data/src/Api',
    ])
  })

  it('normalises Windows separators', () => {
    expect(planServerUpload(['src\\Api\\Router.php']).files[0]).toEqual({ local: 'src/Api/Router.php', remote: 'prism-data/src/Api/Router.php' })
  })
})

describe('listServerFiles', () => {
  it('walks only the shipped folders and the plan then drops the rest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prism-deploy-'))
    tempDirs.push(dir)
    for (const [path, text] of [
      ['config.php', 'secret'], ['src/A.php', ''], ['public/index.php', ''], ['public/.htaccess', ''], ['public/install-x.php', ''],
      ['vendor/v.php', ''], ['tests/t.php', ''], ['bin/b.php', ''],
    ]) {
      mkdirSync(join(dir, path, '..'), { recursive: true })
      writeFileSync(join(dir, path), text)
    }

    const files = planServerUpload(listServerFiles(dir)).files.map((f) => f.local)

    expect(files).toEqual(['src/A.php', 'bin/b.php', 'public/.htaccess', 'public/index.php'])
  })

  it('tolerates folders that do not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'prism-deploy-'))
    tempDirs.push(dir)

    expect(listServerFiles(dir)).toEqual([])
  })
})

describe('deploy', () => {
  const files = ['src/Config.php', 'public/index.php']

  it('does a dry run by default: nothing is uploaded and it says how many files', async () => {
    const lines = []
    let uploaded = false

    await deploy({ config: goodConfig(), serverDir: '.', go: false, listFiles: () => files, log: (l) => lines.push(l), upload: async () => { uploaded = true } })

    expect(uploaded).toBe(false)
    expect(lines.join('\n')).toMatch(/DRY RUN: 2 files would go to u123@access\.example\.invalid:prism-data \(port 22\)/)
  })

  it('uploads with --go and the password never appears in any log line', async () => {
    const lines = []
    const jobs = []

    await deploy({
      config: goodConfig(), serverDir: '.', go: true, listFiles: () => files, log: (l) => lines.push(l),
      env: { IONOS_SSH_PASSWORD: 'S3cretPassw0rd' },
      upload: async (job) => { jobs.push(job); job.log('  uploaded 2 files over SFTP') },
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].password).toBe('S3cretPassw0rd')
    expect(jobs[0].hostKeys).toEqual(goodConfig().ssh.hostKeySha256)
    expect(lines.join('\n')).not.toContain('S3cretPassw0rd')
    expect(lines.join('\n')).toMatch(/DEPLOYED 2 files/)
  })

  it('stops with a clear message when there is no password, without naming one', async () => {
    const attempt = deploy({ config: goodConfig(), serverDir: '.', go: true, listFiles: () => files, log: () => {}, env: {}, envFileText: '', upload: async () => {} })

    await expect(attempt).rejects.toThrow(/IONOS_SSH_PASSWORD is not set/)
  })

  it('takes the password from the .env text when the environment has none', async () => {
    const jobs = []

    await deploy({ config: goodConfig(), serverDir: '.', go: true, listFiles: () => files, log: () => {}, env: {}, envFileText: 'IONOS_SSH_PASSWORD="fromfile"\n', upload: async (j) => { jobs.push(j) } })

    expect(jobs[0].password).toBe('fromfile')
  })

  it('rejects a config with no pinned host key before doing anything', async () => {
    const config = goodConfig()
    delete config.ssh.hostKeySha256

    await expect(deploy({ config, serverDir: '.', go: false, listFiles: () => files, log: () => {} })).rejects.toThrow(/hostKeySha256/)
  })
})

describe('sftpUpload', () => {
  const plan = { dirs: ['prism-data', 'prism-data/src'], files: [{ local: 'src/Config.php', remote: 'prism-data/src/Config.php' }] }
  const job = (extra = {}) => ({ host: 'h', port: 22, user: 'u', password: 'S3cretPassw0rd', plan, baseDir: '/base', hostKeys: [`SHA256:${FAKE_FINGERPRINT}`], log: () => {}, ...extra })

  it('refuses to connect without a pinned host key', async () => {
    await expect(sftpUpload(job({ hostKeys: [] }), { Client: FakeClient })).rejects.toThrow(/pin the server host key/)
    await expect(sftpUpload(job({ hostKeys: undefined }), { Client: FakeClient })).rejects.toThrow(/pin the server host key/)

    expect(FakeClient.instances).toHaveLength(0)
  })

  it('makes directories parents first, then puts each file, then closes', async () => {
    const lines = []

    await sftpUpload(job({ log: (l) => lines.push(l) }), { Client: FakeClient })

    const client = FakeClient.instances[0]
    expect(client.mkdirs).toEqual(['prism-data', 'prism-data/src'])
    expect(client.puts).toEqual([[join('/base', 'src/Config.php'), 'prism-data/src/Config.php']])
    expect(client.ended).toBe(true)
    expect(lines.join('\n')).toContain('uploaded 1 files')
  })

  it('connects with the host key check wired in and the password only in the connect options', async () => {
    await sftpUpload(job(), { Client: FakeClient })

    const options = FakeClient.instances[0].options
    expect(options.username).toBe('u')
    expect(options.password).toBe('S3cretPassw0rd')
    expect(options.hostVerifier(FAKE_KEY)).toBe(true)
    expect(options.hostVerifier(Buffer.from('an impostor'))).toBe(false)
  })

  it('a host key that does not match is refused and the error never contains the password', async () => {
    const attempt = sftpUpload(job({ hostKeys: ['SHA256:someOtherFingerprintValue'] }), { Client: FakeClient })

    const error = await attempt.then(() => null, (e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).not.toContain('S3cretPassw0rd')
    expect(FakeClient.instances[0].puts).toEqual([])
  })
})

describe('hostKeyMatches', () => {
  it('accepts the right fingerprint with or without the SHA256 prefix and rejects another', () => {
    expect(hostKeyMatches(FAKE_KEY, [`SHA256:${FAKE_FINGERPRINT}`])).toBe(true)
    expect(hostKeyMatches(FAKE_KEY, [FAKE_FINGERPRINT])).toBe(true)
    expect(hostKeyMatches(FAKE_KEY, [`SHA256:${FAKE_FINGERPRINT}=`])).toBe(true)
    expect(hostKeyMatches(FAKE_KEY, ['SHA256:notTheRightOne'])).toBe(false)
    expect(hostKeyMatches(FAKE_KEY, [])).toBe(false)
    expect(hostKeyMatches(FAKE_KEY, undefined)).toBe(false)
  })
})

describe('parseEnv and passwordFrom', () => {
  it('parseEnv handles comments, quotes, equals signs inside values and CRLF', () => {
    const text = '# a comment\r\nIONOS_SSH_PASSWORD="a=b=c"\r\n\r\nOTHER=\'single\'\r\nPLAIN=value\r\nnoequals\r\n'

    expect(parseEnv(text)).toEqual({ IONOS_SSH_PASSWORD: 'a=b=c', OTHER: 'single', PLAIN: 'value' })
  })

  it('password precedence is env over .env and blank counts as unset', () => {
    expect(passwordFrom({ IONOS_SSH_PASSWORD: 'fromenv' }, 'IONOS_SSH_PASSWORD=fromfile')).toBe('fromenv')
    expect(passwordFrom({ IONOS_SSH_PASSWORD: '   ' }, 'IONOS_SSH_PASSWORD=fromfile')).toBe('fromfile')
    expect(passwordFrom({}, 'IONOS_SSH_PASSWORD=')).toBeNull()
    expect(passwordFrom({}, '')).toBeNull()
    expect(passwordFrom(undefined, undefined)).toBeNull()
  })
})

describe('validateConfig', () => {
  it('accepts a good config', () => {
    expect(() => validateConfig(goodConfig())).not.toThrow()
  })

  it('rejects a remoteDir with .. or a trailing slash or a leading slash or spaces', () => {
    for (const remoteDir of ['../x', 'a/../b', 'prism-data/', '/prism-data', 'has space', '']) {
      const config = goodConfig()
      config.ssh.remoteDir = remoteDir
      expect(() => validateConfig(config), remoteDir).toThrow(/remoteDir/)
    }
  })

  it('rejects odd hosts, users, ports and a missing or malformed host key list', () => {
    const cases = [
      ['host', 'bad host'], ['host', ''], ['user', 'a;b'], ['port', 0], ['port', 70000], ['port', '22'],
      ['hostKeySha256', []], ['hostKeySha256', 'SHA256:abc'], ['hostKeySha256', ['SHA256:has-dash']],
    ]
    for (const [field, value] of cases) {
      const config = goodConfig()
      config.ssh[field] = value
      expect(() => validateConfig(config), `${field}=${JSON.stringify(value)}`).toThrow(new RegExp(field))
    }
  })
})
