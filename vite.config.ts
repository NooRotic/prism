// Import defineConfig from vitest/config (not vite) so tsc recognizes the
// `test` property. vitest/config re-exports Vite's defineConfig with the
// Vitest UserConfig extensions merged in.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/prism/',
  server: {
    // Fixed port so the Twitch OAuth redirect URI stays stable across runs.
    // strictPort fails loudly if 5000 is taken instead of silently moving to 5001,
    // which would break OAuth (redirect URI must match the Twitch app registration).
    port: 5000,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
