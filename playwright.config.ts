import { defineConfig, devices } from '@playwright/test'

type RuntimeEnv = Record<string, string | undefined>

const env = (globalThis as { process?: { env?: RuntimeEnv } }).process?.env ?? {}

/**
 * Which artifact the suite runs against.
 *
 *   preview  — `vp build` then `vp preview` over dist/. This is the gate: it is
 *              the ONLY configuration that exercises the real bundle, the
 *              manualChunks split, the `__VUESTRATA_DEMO__` compile-out, and MSW
 *              starting from a built artifact rather than the dev server.
 *   dev      — `vp dev`. Fast feedback while writing tests. Proves nothing about
 *              what actually ships.
 *   external — something else is already serving the app; start no server and
 *              point at `E2E_BASE_URL`. This is what lets the suite run against
 *              the running Docker image, which is the PRODUCTION artifact and
 *              was previously never opened by a browser anywhere in CI.
 *
 * Defaults to `preview` in CI and `dev` locally: the safety net is on where it
 * matters and out of the way where it doesn't.
 */
const target = env.E2E_TARGET ?? (env.CI ? 'preview' : 'dev')
const isPreview = target === 'preview'
const isExternal = target === 'external'

const defaultPort = isPreview ? '4173' : '3333'
// An external target must be told where to look; there is no server to guess at.
if (isExternal && !env.E2E_BASE_URL) {
  throw new Error('E2E_TARGET=external requires E2E_BASE_URL to be set.')
}
const e2ePort = env.E2E_PORT ?? defaultPort
const baseURL = env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`

const reuseExistingServer =
  env.E2E_REUSE_EXISTING_SERVER === 'true'
    ? true
    : env.E2E_REUSE_EXISTING_SERVER === 'false'
      ? false
      : !env.CI && e2ePort === defaultPort

// The preview target serves a real build, so the demo configuration must be
// supplied at BUILD time — Vite inlines import.meta.env into the bundle. Without
// these the build resolves to production mode and ships without MSW, and every
// mock-backed test fails against a backend that does not exist.
const demoBuildEnv: Record<string, string> = {
  VUESTRATA_RUNTIME_MODE: 'demo',
  VUESTRATA_USE_MOCKS: 'true',
  VUESTRATA_AUTH_ADAPTER: 'mock',
}

const webServerCommand = isPreview
  ? `vp build && vp preview --port ${e2ePort} --host 127.0.0.1`
  : `vp dev --port ${e2ePort} --host 127.0.0.1`

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
  // `external` deliberately has NO webServer: the caller already started one
  // (the Docker image, a staging deployment) and Playwright must not try to
  // build over the top of it.
  ...(isExternal
    ? {}
    : {
        webServer: {
          command: webServerCommand,
          url: baseURL,
          reuseExistingServer,
          // A cold production build is far slower than booting the dev server.
          timeout: isPreview ? 300_000 : 120_000,
          env: isPreview ? demoBuildEnv : {},
        },
      }),
})
