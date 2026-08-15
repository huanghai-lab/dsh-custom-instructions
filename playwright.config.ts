import { defineConfig } from '@playwright/test'

/**
 * Optional real-GUI e2e: runs only when E2E_BASE_URL names a running DSH Web
 * GUI (with this plugin mounted in its web profile). Skipped otherwise — the
 * unit suite does not need a browser.
 */
const baseURL = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
})
