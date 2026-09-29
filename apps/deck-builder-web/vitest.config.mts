import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    // e2e/ holds Playwright specs. Without this, vitest globs them and they
    // fail with "Playwright Test did not expect test() to be called here".
    exclude: ['node_modules/**', 'e2e/**', '.next/**'],
  },
})
