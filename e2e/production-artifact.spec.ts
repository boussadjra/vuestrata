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

test('answers the health probe itself', async ({ page }) => {
  const response = await page.request.get('/healthz')

  expect(response.status()).toBe(200)
  expect(await response.text()).toBe('ok')
  // The SPA fallback would answer 200 too, with HTML. A probe must not be
  // satisfied by that.
  expect(response.headers()['content-type']).toContain('text/plain')
})

test('fails an unrouted API call as JSON, not with the SPA shell', async ({ page }) => {
  // The image is built for the default same-origin VUESTRATA_API_URL=/api (CI
  // builds it that way) and nothing routes /api/ here: that is the ingress's
  // job. The SPA fallback used to answer with index.html and a 200, so the app
  // failed parsing HTML as JSON, far from the actual cause.
  const response = await page.request.get('/api/anything')

  expect(response.status()).toBe(502)
  const contentType = response.headers()['content-type']
  expect(contentType).toContain('application/json')
  expect(contentType).not.toContain('text/html')
  expect(await response.json()).toMatchObject({ error: 'api_not_routed' })
})

test('serves JavaScript compressed', async ({ page }) => {
  const html = await (await page.request.get('/')).text()
  const script = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1]
  expect(script, 'index.html references no /assets/*.js entry script').toBeDefined()

  const response = await page.request.get(script!, { headers: { 'Accept-Encoding': 'gzip' } })

  expect(response.status()).toBe(200)
  expect(response.headers()['content-encoding']).toBe('gzip')
  // Without it, a shared cache could hand the gzipped body to a client that
  // never asked for one.
  expect(response.headers()['vary']).toMatch(/accept-encoding/i)
})

test('does not cache a missing asset', async ({ page }) => {
  // A chunk requested mid-deploy from a server that does not have it yet. A
  // year-long immutable 404 would break that chunk for the user long after
  // the deploy finished.
  const response = await page.request.get('/assets/not-a-real-chunk.js')

  expect(response.status()).toBe(404)
  expect(response.headers()['cache-control'] ?? '').not.toContain('immutable')
})

test('does not cache files outside /assets/ as immutable', async ({ page }) => {
  const response = await page.request.get('/favicon.svg')

  expect(response.status()).toBe(200)
  // Only /assets/ is content-hashed. A file that keeps its name when it
  // changes, cached immutably for a year, never reaches a returning user.
  expect(response.headers()['cache-control']).not.toContain('immutable')
})
