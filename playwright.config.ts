import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:31847'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  webServer: {
    command: 'node tests/e2e/start-dsh.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  use: {
    baseURL,
    locale: 'zh-CN',
    actionTimeout: 15_000,
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
})
