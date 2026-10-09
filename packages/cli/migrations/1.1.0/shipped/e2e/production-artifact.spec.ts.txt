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
 *     vpr test:e2e e2e/production-artifact.spec.ts --project=chromium
 *
 * One image serves every environment, so the same suite runs against the same
 * image started differently. `E2E_API_URL` says what the container was given,
 * and the suite then checks that the page, the app and the CSP all follow it:
 *
 *   docker run -d -p 8081:8080 -e VUESTRATA_API_URL=https://api.staging.example.test vuestrata
 *   E2E_TARGET=external E2E_BASE_URL=http://127.0.0.1:8081 \
 *     E2E_API_URL=https://api.staging.example.test \
 *     vpr test:e2e e2e/production-artifact.spec.ts --project=chromium
 *
 * `E2E_APP_TITLE` does the same for a title (`-e VUESTRATA_APP_TITLE="Acme
 * Console"`). An API URL on a placeholder host is a case of its own, because
 * the BUILD refuses one and a container must not:
 *
 *   docker run -d -p 8082:8080 -e VUESTRATA_API_URL=http://localhost:8000 vuestrata
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

/**
 * `apiBase` is where this container's API calls go. With no backend there, the
 * app logs each one as failed, and that is as expected as the browser's own
 * "Failed to load resource" — for a cross-origin API as much as for `/api/`.
 *
 * A Content Security Policy violation is never noise, whatever URL it names: a
 * policy that blocks the API the container was started with is exactly the
 * defect this suite exists to catch.
 */
function collectConsoleErrors(page: Page, apiBase: string): string[] {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return
    const text = message.text()
    const blockedByPolicy = /Content Security Policy/i.test(text)
    const expected =
      text.includes(apiBase) || IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))
    if (expected && !blockedByPolicy) return
    errors.push(text)
  })
  return errors
}

test('the app boots', async ({ page, baseURL }) => {
  const { VUESTRATA_API_URL: apiUrl = '/api' } = await runtimeConfig(page)
  const errors = collectConsoleErrors(page, apiBaseOf(apiUrl, baseURL))

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

/**
 * What the container was started with, as the page will see it: the object
 * `/runtime-config.js` assigns to `window.__VUESTRATA_RUNTIME__`.
 */
async function runtimeConfig(page: Page): Promise<Record<string, string>> {
  const script = await (await page.request.get('/runtime-config.js')).text()
  const literal = /^window\.__VUESTRATA_RUNTIME__ = (\{.*\});\s*$/.exec(script)?.[1]
  expect(literal, `Unexpected /runtime-config.js:\n${script}`).toBeDefined()
  return JSON.parse(literal!) as Record<string, string>
}

/**
 * The absolute URL the app's API calls start with, no trailing slash: the
 * configured URL itself, or the page's origin followed by a same-origin path.
 */
function apiBaseOf(apiUrl: string, baseURL: string | undefined): string {
  return new URL(apiUrl, baseURL).href.replace(/\/+$/, '')
}

/** The `connect-src` sources of the CSP header the server sends. */
async function connectSrcOf(page: Page): Promise<string[]> {
  const csp = (await page.request.get('/')).headers()['content-security-policy'] ?? ''
  return /(?:^|;)\s*connect-src ([^;]*)/.exec(csp)?.[1]?.trim().split(/\s+/) ?? []
}

test('serves the runtime configuration as a script, never cached', async ({ page }) => {
  const response = await page.request.get('/runtime-config.js')

  expect(response.status()).toBe(200)
  // The SPA fallback would answer 200 as well, with HTML, and the page's first
  // script would be a syntax error.
  expect(response.headers()['content-type']).toMatch(/javascript/)
  // Written per container under a name that never changes: a cached copy
  // would keep a browser on the previous environment's values.
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(await response.text()).toMatch(/^window\.__VUESTRATA_RUNTIME__ = \{/)
  // The security headers are re-included in this location like any other.
  expect(response.headers()['content-security-policy']).toContain("default-src 'self'")
})

test('loads the runtime configuration before the app', async ({ page }) => {
  const html = await (await page.request.get('/')).text()

  const config = html.indexOf('<script src="/runtime-config.js"></script>')
  expect(config, 'index.html does not load /runtime-config.js').toBeGreaterThanOrEqual(0)
  expect(config).toBeLessThan(html.search(/<script[^>]+type="module"/))
  // Never inlined: the same image must be able to serve other values.
  expect(html).not.toContain('__VUESTRATA_RUNTIME__')
})

test('hands the container environment to the page', async ({ page }) => {
  const served = await runtimeConfig(page)

  await page.goto('/')
  const seen = await page.evaluate(
    () => (window as unknown as { __VUESTRATA_RUNTIME__?: unknown }).__VUESTRATA_RUNTIME__,
  )

  // The image always carries an API URL: the Dockerfile makes the build's
  // value the container's default, so the headers and the app cannot disagree.
  expect(seen).toEqual(served)
  expect(typeof served.VUESTRATA_API_URL).toBe('string')
  // The caller may say what it started the container with.
  if (env.E2E_API_URL) expect(served.VUESTRATA_API_URL).toBe(env.E2E_API_URL)
})

test('calls the API the container was started with', async ({ page, baseURL }) => {
  // The value in runtime-config.js is only worth something if the app uses it.
  // At boot, the jwt adapter asks the API to resume a session; where that
  // request goes is the API base the app resolved.
  const { VUESTRATA_API_URL: apiUrl = '/api', VUESTRATA_SESSION_PERSISTENCE: persistence } =
    await runtimeConfig(page)
  test.skip(persistence === 'none', 'This container makes no API call at boot.')

  const apiBase = apiBaseOf(apiUrl, baseURL)
  const sameOriginApiCalls: string[] = []
  page.on('request', (candidate) => {
    if (candidate.url().startsWith(`${new URL(baseURL!).origin}/api/`)) {
      sameOriginApiCalls.push(candidate.url())
    }
  })
  const request = page.waitForRequest((candidate) => candidate.url().startsWith(`${apiBase}/`), {
    timeout: 20_000,
  })
  await page.goto('/dashboard')

  expect((await request).url()).toBe(`${apiBase}/auth/refresh`)
  await expect(page).toHaveURL(/\/auth\/login/, { timeout: 20_000 })

  // A container started with an absolute URL must not also call /api on its
  // own origin. That is what the app did for a URL on a placeholder host such
  // as http://localhost:8000: the headers allowed the origin, the app fell
  // back to /api, and the SPA fallback answered its refresh call with HTML.
  if (!apiUrl.startsWith('/')) expect(sameOriginApiCalls).toEqual([])
})

test('shows the title the container was started with', async ({ page }) => {
  const { VUESTRATA_APP_TITLE: title } = await runtimeConfig(page)
  test.skip(title === undefined, 'This container was started with no title.')

  await page.goto('/auth/login')
  await expect(page.locator('#app-loader')).toHaveCount(0, { timeout: 20_000 })

  // "Acme Console" has a space in it, and the page title ends with it.
  await expect(page).toHaveTitle(new RegExp(`${title!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
  if (env.E2E_APP_TITLE) expect(title).toBe(env.E2E_APP_TITLE)
})

test('does not block in the page what the header allows', async ({ page }) => {
  // A browser enforces the page's own CSP <meta> in addition to the header.
  // The image decides its API origin at start, long after index.html was
  // written, so its tag must leave connections to the header: a tag that
  // named the build's origin would block the one this container was given.
  const html = await (await page.request.get('/')).text()
  const meta = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)?.[1] ?? ''
  const metaConnect = /(?:^|;)\s*connect-src ([^;]*)/.exec(meta)?.[1]?.trim().split(/\s+/) ?? []
  const headerConnect = await connectSrcOf(page)

  expect(metaConnect.length, 'the page states no connect-src').toBeGreaterThan(0)
  for (const source of headerConnect) {
    expect(metaConnect.includes('*') || metaConnect.includes(source), source).toBe(true)
  }
  // The header itself is never wide.
  expect(headerConnect).not.toContain('*')
})

test('allows the configured API origin in the CSP, and only as an origin', async ({
  page,
  baseURL,
}) => {
  const { VUESTRATA_API_URL: apiUrl = '/api' } = await runtimeConfig(page)
  const connectSrc = await connectSrcOf(page)

  expect(connectSrc).toContain("'self'")
  // One invalid source makes a browser discard the whole directive, so every
  // one of them must be exactly an origin.
  for (const source of connectSrc.filter((entry) => entry !== "'self'")) {
    expect(source).toMatch(/^(https?|wss?):\/\/[a-z0-9*.-]+(:\d+)?$/)
  }

  if (apiUrl.startsWith('/')) {
    // Same origin: 'self' covers it, and no API origin was added for it.
    expect(connectSrc).not.toContain(new URL(baseURL!).origin)
  } else {
    expect(connectSrc).toContain(new URL(apiUrl).origin)
    expect(connectSrc.join(' ')).not.toContain(new URL(apiUrl).pathname.replace(/\/$/, '') || ' / ')
  }
})

test('fails an unrouted API call as JSON, not with the SPA shell', async ({ page }) => {
  // With a same-origin VUESTRATA_API_URL such as the default /api, nothing
  // routes that path here: that is the ingress's job. The SPA fallback used to
  // answer with index.html and a 200, so the app failed parsing HTML as JSON,
  // far from the actual cause.
  //
  // A container started with an absolute API URL has no such block, and its
  // CSP names that origin in connect-src. There is nothing to check then.
  const { VUESTRATA_API_URL: apiUrl = '/api' } = await runtimeConfig(page)
  test.skip(!apiUrl.startsWith('/'), 'The container was started with a cross-origin API.')
  const api = apiUrl.replace(/\/+$/, '')
  test.skip(api === '', 'The API is at the site root: no prefix to answer for.')

  // The extensions are there because nginx labels a response from the
  // request's own extension unless told otherwise: /api/export.html once came
  // back as text/html, and the client could not read the error in it.
  for (const path of [`${api}/anything`, api, `${api}/export.html`]) {
    const response = await page.request.get(path)

    expect(response.status(), path).toBe(502)
    const contentType = response.headers()['content-type']
    expect(contentType, path).toContain('application/json')
    expect(contentType, path).not.toContain('text/html')
    expect(await response.json(), path).toMatchObject({ error: 'api_not_routed' })
  }
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

test('revalidates the app shell on every load', async ({ page }) => {
  // Every SPA route is served from index.html, which names every hashed
  // chunk. The deep link goes through try_files and an internal redirect, so
  // this is the check that it lands in the no-cache block and not in the
  // hour-long one for other files. If it did not, a returning user would be
  // asked for the previous deploy's chunk names.
  for (const path of ['/', '/dashboard', '/index.html']) {
    const response = await page.request.get(path)

    expect(response.status(), path).toBe(200)
    expect(response.headers()['cache-control'], path).toContain('no-cache')
  }
})

test('never caches the file that names the running build', async ({ page }) => {
  const response = await page.request.get('/version.json')

  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')
})

test('answers a missing script or image with a 404, not the app', async ({ page }) => {
  // Through the SPA fallback a stale <img> or a removed script would get
  // index.html with a 200, and nothing would look broken.
  for (const path of ['/removed-script.js', '/missing.png', '/imgs/missing.svg']) {
    const response = await page.request.get(path)

    expect(response.status(), path).toBe(404)
    expect(response.headers()['cache-control'] ?? '', path).not.toContain('immutable')
  }
})

test('does not cache files outside /assets/ as immutable', async ({ page }) => {
  const response = await page.request.get('/favicon.svg')

  expect(response.status()).toBe(200)
  // Only /assets/ is content-hashed. A file that keeps its name when it
  // changes, cached immutably for a year, never reaches a returning user.
  expect(response.headers()['cache-control']).not.toContain('immutable')
})
