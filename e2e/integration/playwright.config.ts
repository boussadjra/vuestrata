import { defineConfig, devices } from '@playwright/test'

/**
 * The browser tests that need a real backend's behaviour rather than the
 * demo's service worker: cookies, a CSRF token, a session that ends.
 *
 * They run against a PRODUCTION build made for the `session` adapter, served
 * by `e2e/helpers/stub-backend/server.mjs`, which is also the API that build
 * talks to, on the same origin. The script builds before starting Playwright:
 *
 *   vpr test:e2e:session
 *
 * It is a config of its own so that `vpr test:e2e`, the demo suite, neither
 * runs these nor needs that build: the root config ignores this folder.
 *
 * Every path below is relative to this file's directory, which is what
 * Playwright resolves `testDir` and `outputDir` against and where it runs the
 * `webServer` command.
 */
type RuntimeEnv = Record<string, string | undefined>

const env = (globalThis as { process?: { env?: RuntimeEnv } }).process?.env ?? {}

const port = env.E2E_PORT ?? '4174'
const baseURL = `http://127.0.0.1:${port}`

/**
 * Where `build.mjs` beside this file leaves the built app. `E2E_SESSION_DIST`
 * moves it for both: absolute, or relative to the repository root.
 */
const dist = ((custom: string | undefined) => {
  if (!custom) return '../../node_modules/.cache/vuestrata/e2e-session/dist'
  return /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(custom) ? custom : `../../${custom}`
})(env.E2E_SESSION_DIST)

export default defineConfig({
  testDir: '.',
  // One backend with one set of sessions: the tests take turns.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!env.CI,
  retries: env.CI ? 2 : 0,
  reporter: env.CI ? 'github' : 'list',
  outputDir: '../../test-results/integration',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node ../helpers/stub-backend/server.mjs --dist "${dist}" --port ${port}`,
    url: `${baseURL}/sanctum/csrf-cookie`,
    reuseExistingServer: env.E2E_REUSE_EXISTING_SERVER === 'true',
    timeout: 30_000,
  },
})
