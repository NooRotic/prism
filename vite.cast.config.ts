// prism-cast.nooroticx.tv: the help page (/) and the TV page (/tv/), their own build, uploaded by tools/deploy-cast.mjs. The
// repository is the root, so they share PRISM's modules and the flag pictures; `publicDir` is their own, so the site's public/
// is not copied to the TV's host.
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** The pages are cast/index.html and cast/tv/index.html here, index.html and tv/index.html on the host. */
const pagesAtTheTop: Plugin = {
  name: 'prism-cast-pages-at-the-top',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const [from, to] of [['cast/index.html', 'index.html'], ['cast/tv/index.html', 'tv/index.html']]) {
      const page = bundle[from]
      if (page) page.fileName = to
    }
  },
}

export default defineConfig({
  plugins: [react(), pagesAtTheTop],
  base: '/',
  publicDir: 'cast/public',
  build: {
    outDir: 'dist-cast',
    emptyOutDir: true,
    target: 'chrome87',
    rollupOptions: { input: { help: 'cast/index.html', tv: 'cast/tv/index.html' } },
  },
})
