import { defineConfig, devices } from '@playwright/test'

type RuntimeEnv = Record<string, string | undefined>

const env = (globalThis as { process?: { env?: RuntimeEnv } }).process?.env ?? {}
const e2ePort = env.E2E_PORT ?? '3333'
const baseURL = env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`
const reuseExistingServer =
  env.E2E_REUSE_EXISTING_SERVER === 'true'
    ? true
    : env.E2E_REUSE_EXISTING_SERVER === 'false'
      ? false
      : !env.CI && e2ePort === '3333'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!env.CI,
  retries: env.CI ? 2 : 0,
  workers: env.PLAYWRIGHT_WORKERS ? Number(env.PLAYWRIGHT_WORKERS) : 1,
  reporter: env.CI ? 'github' : 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: `vp dev --port ${e2ePort} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer,
    timeout: 120_000,
  },
})
