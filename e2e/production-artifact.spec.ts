import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * The PRODUCTION artifact, in a real browser.
 *
 * CI built the production bundle and asserted things about its contents with
 * `verify-bundle.mjs`, but no browser ever opened it. A production-mode build
 * that white-screened on boot — a bad env resolution, a provider wired only in
 * the demo path, an import removed by the `__VUESTRATA_DEMO__` compile-out that
 * production actually needed — passed every gate. `verify-bundle` inspects
 * files; it cannot tell you the app mounts.
 *
 * These tests run against the running Docker image, which is the artifact a
 * real deployment ships:
 *
 *   docker build -t vuestrata .
 *   docker run -d -p 8080:8080 vuestrata
 *   E2E_TARGET=external E2E_BASE_URL=http://127.0.0.1:8080 \
 *     vpr test:e2e -- e2e/production-artifact.spec.ts --project=chromium
 *
 * There is no backend behind it. That is the point: an unauthenticated visitor
 * must still get a working login screen, and every assertion here is chosen to
 * hold without an API.
 */

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

// The rest of the suite runs against the DEMO preview, where MSW is present by
// design and these assertions would be wrong. Only the external target is
// pointed at a production artifact.
const isExternalTarget = env.E2E_TARGET === 'external'

test.skip(
  !isExternalTarget,
  'Production-artifact checks require E2E_TARGET=external pointing at a production build.',
)

/** Console errors that are environmental noise rather than app defects. */
const IGNORED_CONSOLE_PATTERNS = [
  /favicon/i,
  /Download the Vue Devtools/i,
  // With no backend behind the artifact, every data request fails. That is the
  // expected condition here, not a defect.
  /Failed to load resource/i,
  /net::ERR_/i,
  /\/api\//i,
]

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return
    errors.push(text)
  })
  return errors
}

test('the app boots', async ({ page }) => {
  const errors = collectConsoleErrors(page)

  await page.goto('/')

  // The pre-mount loader removes itself only after `app.mount()` has run, so
  // its disappearance is the most direct evidence that bootstrap completed.
  // This is the assertion `verify-bundle` structurally cannot make: it reads
  // files, and a file can be perfectly well-formed and still white-screen.
  await expect(page.locator('#app-loader')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator('#app')).not.toBeEmpty()

  expect(errors, `Unexpected console errors:\n${errors.join('\n')}`).toEqual([])
})

test('the route guard redirects an unauthenticated visitor to login', async ({ page }) => {
  // `/` is a public landing page, so it is not evidence either way. A route
  // behind `requiresAuth` is: with no session cookie and no refresh cookie,
  // the guard must land the visitor on login rather than on a blank shell or a
  // dashboard skeleton that will never populate.
  await page.goto('/dashboard')

  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })
  await expect(page.locator('#app')).not.toBeEmpty()
})

test('serves the security headers', async ({ page }) => {
  const response = await page.goto('/')
  expect(response).not.toBeNull()

  const headers = response!.headers()

  // Regression guard for the nginx `add_header` inheritance trap: a
  // `Cache-Control` inside `location /` silently drops every header set at the
  // `server` level, so these were absent from exactly the responses that
  // matter. The generated config re-includes them per location.
  expect(headers['content-security-policy']).toContain("default-src 'self'")
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['strict-transport-security']).toContain('max-age=31536000')
})

test('does not publish the mock service worker', async ({ page }) => {
  const response = await page.request.get('/mockServiceWorker.js')

  // The SPA fallback returns index.html for unknown paths, so "not 404" is not
  // enough — assert it is not actually the worker script.
  if (response.status() === 200) {
    expect(await response.text()).not.toContain('Mock Service Worker')
  }
})

test('identifies which build is running', async ({ page }) => {
  const response = await page.request.get('/version.json')
  expect(response.status()).toBe(200)

  const version = (await response.json()) as Record<string, unknown>
  expect(version.runtimeMode).toBe('production')
  expect(typeof version.release).toBe('string')
  expect(version.buildTime).toBeTruthy()
})

test('serves robots.txt rather than the SPA fallback', async ({ page }) => {
  const response = await page.request.get('/robots.txt')

  expect(response.status()).toBe(200)
  const body = await response.text()
  expect(body).toContain('User-agent:')
  // If the rewrite rules are wrong this returns index.html with a 200, which is
  // worse than a 404 because nothing looks broken.
  expect(body).not.toContain('<!doctype html>')
})
