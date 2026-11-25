// The TV page (https://prism-cast.nooroticx.tv): its own build, uploaded by tools/deploy-cast.mjs. The repository is the root, so
// it shares PRISM's modules and the flag pictures; `publicDir` is its own, so the site's public/ is not copied to the TV's host.
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** The page is cast/index.html here and index.html on the host. */
const pageAtTheTop: Plugin = {
  name: 'prism-cast-page-at-the-top',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const page = bundle['cast/index.html']
    if (page) page.fileName = 'index.html'
  },
}

export default defineConfig({
  plugins: [react(), pageAtTheTop],
  base: '/',
  publicDir: 'cast/public',
  build: {
    outDir: 'dist-cast',
    emptyOutDir: true,
    target: 'chrome87',
    rollupOptions: { input: 'cast/index.html' },
  },
})
