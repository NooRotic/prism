import { deployCast, planCastUpload } from '../lib/castDeploy.mjs'

const SSH = { host: 'h.example', user: 'u1', port: 22, remoteDir: 'prism-data', hostKeySha256: ['SHA256:abc'] }
const FILES = ['index.html', '.htaccess', 'assets/b.css', 'tv/index.html', 'assets/deep/a.js', 'icon.svg', 'cast-device.js']

describe('planCastUpload', () => {
  it('puts the pages last, the TV page and then the help page, so a page never names a file that is not there yet', () => {
    const { files } = planCastUpload(FILES)
    expect(files.slice(-2)).toEqual([
      { local: 'tv/index.html', remote: 'PRISM/casting/tv/index.html' },
      { local: 'index.html', remote: 'PRISM/casting/index.html' },
    ])
    expect(files.map((f) => f.local)).toContain('.htaccess')
    expect(files.map((f) => f.local)).toContain('cast-device.js')
  })

  it('makes parent folders before their children, and never the folders above its own', () => {
    expect(planCastUpload(FILES).dirs).toEqual(['PRISM/casting/assets', 'PRISM/casting/tv', 'PRISM/casting/assets/deep'])
  })

  it.each(['.env', 'assets/.env.local', 'assets/a.js.map', '../x.js', 'assets/../../x.js', '/etc/x', 'C:/x.js'])('refuses %s', (bad) => {
    expect(() => planCastUpload([...FILES, bad])).toThrow(/will not upload/)
  })

  it('refuses a build with no help page or no TV page', () => {
    expect(() => planCastUpload(['assets/a.js', 'tv/index.html'])).toThrow(/index\.html/)
    expect(() => planCastUpload(['assets/a.js', 'index.html'])).toThrow(/tv\/index\.html/)
  })
})

describe('deployCast', () => {
  const run = (over = {}) => {
    const lines = []
    const upload = vi.fn(() => Promise.resolve())
    const done = deployCast({ ssh: SSH, files: FILES, baseDir: 'dist-cast', go: true, env: { IONOS_SSH_PASSWORD: 'hunter2' }, log: (l) => lines.push(l), upload, ...over })
    return { done, lines, upload }
  }

  it('uploads nothing unless told to', async () => {
    const { done, upload, lines } = run({ go: false, env: {} })
    await done
    expect(upload).not.toHaveBeenCalled()
    expect(lines.join('\n')).toMatch(/DRY RUN/)
  })

  it('uploads the plan, and never prints the password', async () => {
    const { done, upload, lines } = run()
    await done
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ host: 'h.example', password: 'hunter2', hostKeys: ['SHA256:abc'], baseDir: 'dist-cast' }))
    expect(lines.join('\n')).not.toContain('hunter2')
  })

  it('refuses without a pinned host key, or without a password', async () => {
    await expect(run({ ssh: { ...SSH, hostKeySha256: [] } }).done).rejects.toThrow(/hostKeySha256/)
    await expect(run({ env: {} }).done).rejects.toThrow(/IONOS_SSH_PASSWORD/)
  })
})
