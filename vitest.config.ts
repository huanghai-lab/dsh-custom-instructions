import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.{ts,tsx}'],
    // The Playwright suite under tests/e2e is driven by `pnpm e2e`, not vitest.
    exclude: ['tests/e2e/**', 'node_modules/**'],
    pool: 'forks',
    environment: 'node',
  },
})
