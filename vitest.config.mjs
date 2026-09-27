import { defineConfig } from 'vitest/config'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [{
    name: 'script-hashbang',
    enforce: 'pre',
    // Vite hoists imports ahead of CLI hashbangs, which is invalid JavaScript.
    // Keep the scripts executable directly while testing them as modules.
    transform(code, id) {
      if (id.replaceAll('\\', '/').includes('/scripts/') && code.startsWith('#!')) {
        return { code: code.replace(/^#![^\r\n]*/, ''), map: null }
      }
    },
  }],
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': root,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // Gate the pure business logic that is unit-tested. Infra modules
      // (db/s3/email/etc.) and React components are not gated here.
      include: ['lib/quoting/**', 'lib/download/**', 'utils/customPrintStatus.js'],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
})
