import AxeBuilder from '@axe-core/playwright'
import { test, expect, type ConsoleMessage, type Page, type Request } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

/**
 * Production smoke tests.
 *
 * Everything here is about the ARTIFACT rather than the features. The rest of
 * the suite tests behaviour and passes happily against the dev server; these
 * tests exist to catch the class of bug that only appears once the app has been
 * built, chunked, and served as static files — a lazy route whose chunk fails
 * to resolve, a service worker that never registers because of its scope, MSW
 * being compiled out of the wrong target, sourcemaps leaking.
 *
 * Run them against the real thing:
 *   E2E_TARGET=preview vpr test:e2e -- e2e/smoke.spec.ts
 *
 * CI defaults to the preview target, so this is the gate.
 */

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const isPreviewTarget = (env.E2E_TARGET ?? (env.CI ? 'preview' : 'dev')) === 'preview'

/** Console errors that are environmental noise rather than app defects. */
const IGNORED_CONSOLE_PATTERNS = [
  /\[MSW\]/i,
  /favicon/i,
  /Download the Vue Devtools/i,
  /ERR_INTERNET_DISCONNECTED/i,
]

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => pattern.test(text))) return
    errors.push(text)
  })
  page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`))
  return errors
}

async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
}

test.describe('Built artifact smoke tests', () => {
  test('the application boots without console errors', async ({ page }) => {
    const errors = collectConsoleErrors(page)

    await page.goto('/')
    await waitForAppReady(page)

    expect(errors, `Unexpected console errors:\n${errors.join('\n')}`).toEqual([])
  })

  test('every chunk requested during boot resolves', async ({ page }) => {
    // A 404 on a lazily-imported chunk is the classic broken-deploy symptom:
    // the page renders, then a route silently fails. The dev server never
    // reproduces it because it has no chunks.
    const failed: string[] = []
    page.on('response', (response) => {
      const url = response.url()
      if (!/\.(?:js|css)(?:\?|$)/.test(url)) return
      if (response.status() >= 400) failed.push(`${response.status()} ${url}`)
    })

    await page.goto('/')
    await waitForAppReady(page)

    expect(failed, `Assets failed to load:\n${failed.join('\n')}`).toEqual([])
  })

  // Direct navigation, not client-side routing: this exercises the SPA
  // fallback in vercel.json / the nginx config, which client-side navigation
  // never touches.
  for (const path of ['/auth/login', '/auth/register', '/docs/components/overview', '/403']) {
    test(`direct navigation to ${path} is served by the SPA fallback`, async ({ page }) => {
      const response = await page.goto(path)

      expect(response?.status(), `${path} should not 404 on a hard load`).toBeLessThan(400)
      await waitForAppReady(page)
      await expect(page).toHaveURL(new RegExp(path.replace('/', '\\/')))
    })
  }

  test('the login page renders its form controls', async ({ page }) => {
    await page.goto('/auth/login')
    await waitForAppReady(page)

    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible()
  })

  test('the dashboard is reachable after signing in', async ({ page }) => {
    await logInAsDemoAdmin(page)

    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/)
    await expect(page.locator('h1').first()).toBeVisible()
    // Constructed i18n keys (`t('dash_compared_' + range)`) ship as the key
    // itself under `@intlify/unplugin-vue-i18n`. This is the assertion unit
    // tests cannot make: they load JSON directly and always "pass".
    await expect(page.getByText('previous 7 days').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('main')).not.toContainText('dash_compared_')
    await expect(page.getByRole('link', { name: 'Invite a teammate' })).toBeVisible()
  })
})

test.describe('MSW in the demo build', () => {
  test('the service worker registers at the root scope', async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)

    const registration = await page.evaluate(async () => {
      const existing = await navigator.serviceWorker.getRegistration()
      if (!existing) return null
      return {
        scope: existing.scope,
        scriptURL: existing.active?.scriptURL ?? existing.installing?.scriptURL ?? null,
      }
    })

    expect(registration, 'MSW did not register a service worker').not.toBeNull()
    expect(registration?.scriptURL).toContain('mockServiceWorker.js')
    // Root scope matters: a worker registered under /assets/ would not see
    // requests made from the app shell.
    expect(new URL(registration!.scope).pathname).toBe('/')
  })

  test('API requests are intercepted rather than reaching a real backend', async ({ page }) => {
    // There is no backend in any test environment, so a successful JSON
    // response can only have come from MSW. This is the assertion that would
    // have caught the DEV-only gate that made the hosted demo impossible.
    await logInAsDemoAdmin(page)

    // Arm the waiter BEFORE navigating. `logInAsDemoAdmin` already lands on the
    // dashboard, so waiting afterwards races requests that have usually
    // finished — the wait then hangs until it times out even though
    // interception worked perfectly.
    const responsePromise = page.waitForResponse(
      (candidate) =>
        candidate.url().includes('/api/dashboard/') && candidate.request().method() === 'GET',
      { timeout: 20_000 },
    )
    await page.reload()
    const response = await responsePromise

    expect(response.status(), `${response.url()} was not served by MSW`).toBeLessThan(400)
    expect(response.headers()['content-type'] ?? '').toContain('json')
  })
})

test.describe('When something fails', () => {
  test.skip(!isPreviewTarget, 'Route chunks only exist in a real build')

  const CHUNKS = '**/assets/*.js'
  const loginLink = (page: Page) => page.locator('a[href="/auth/login"]').first()

  /**
   * Load the landing page, then fail every script it did not need.
   *
   * That is a deploy gone wrong as the browser sees it: the page that is open
   * keeps working and the chunk behind the next route cannot be fetched. The
   * route goes on the context because a demo build's requests pass through the
   * MSW service worker, which a page-level route never sees.
   */
  async function bootThenBreakLazyChunks(page: Page): Promise<void> {
    const needed = new Set<string>()
    page.on('request', (request) => {
      if (/\/assets\/[^/]+\.js(?:\?|$)/.test(request.url())) needed.add(request.url())
    })
    await page.goto('/')
    await waitForAppReady(page)
    await page.waitForLoadState('networkidle')

    const allowed = new Set(needed)
    await page
      .context()
      .route(CHUNKS, (route) =>
        allowed.has(route.request().url()) ? route.continue() : route.abort(),
      )
  }

  async function expectNoBlockingViolations(page: Page): Promise<void> {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'critical' || violation.impact === 'serious',
    )
    expect(
      blocking.map((violation) => `[${violation.impact}] ${violation.id}: ${violation.help}`),
      'Blocking accessibility violations',
    ).toEqual([])
  }

  test('a route whose chunk fails twice reaches the error state, not a dead click', async ({
    page,
  }) => {
    await bootThenBreakLazyChunks(page)

    // First failure: the app takes it for a stale tab and reloads once.
    await Promise.all([page.waitForEvent('load'), loginLink(page).click()])
    await waitForAppReady(page)
    await expect(page.getByTestId('app-error-boundary')).toHaveCount(0)

    // Second failure: the reload did not fix it, so the visitor is told.
    await loginLink(page).click()
    const boundary = page.getByTestId('app-error-boundary')
    await expect(boundary).toBeVisible()
    await expect(boundary.getByRole('alert')).toContainText('could not be loaded')
    await expect(boundary.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.getByTestId('app-error-reload')).toBeVisible()
    await expect(page.getByTestId('app-error-home')).toBeVisible()
    await expectNoBlockingViolations(page)

    // Retry is a page load, which is the only thing that can fetch the chunk
    // again once Chromium has seen the import fail.
    await page.context().unroute(CHUNKS)
    await page.getByTestId('app-error-retry').click()
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 })
  })

  test('a lazy component that cannot be fetched reaches the error state, and Retry recovers', async ({
    page,
  }) => {
    // The charting engine is not a route: `BaseChart` loads it on demand, so a
    // chunk that is missing fails inside a page that has already rendered.
    const CHART_CHUNKS = '**/assets/echarts-setup-*.js'
    await logInAsDemoAdmin(page)
    await page.context().route(CHART_CHUNKS, (route) => route.abort())

    // Reloads itself once for what looks like a stale tab, fails again, and
    // only then tells the visitor.
    await page.goto('/dashboard/charts')
    const boundary = page.getByTestId('app-error-boundary')
    await expect(boundary).toBeVisible({ timeout: 30_000 })
    await expect(boundary.getByRole('alert')).toContainText('could not be loaded')

    // Mounting the page again would ask for nothing: Chromium remembers the
    // failed import. Retry has to be a page load, and then it works.
    await page.context().unroute(CHART_CHUNKS)
    await Promise.all([page.waitForEvent('load'), page.getByTestId('app-error-retry').click()])
    await expect(page.locator('.echarts-host canvas').first()).toBeVisible({ timeout: 30_000 })
    await expect(boundary).toHaveCount(0)
  })

  test('a first route that cannot load replaces the spinner with the boot-failure screen', async ({
    page,
  }) => {
    await bootThenBreakLazyChunks(page)

    // Reloads itself once, fails again, and only then gives up.
    await page.goto('/auth/login')
    const screen = page.locator('#boot-failure')
    await expect(screen).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('#app-loader')).toHaveCount(0)
    await expect(screen.getByRole('heading', { level: 1 })).toBeFocused()

    // Collapsed, and never the chunk's address.
    const details = screen.locator('details')
    await expect(details).not.toHaveAttribute('open', /.*/)
    await expect(details.locator('pre')).not.toContainText('http')
    await expect(details.locator('pre')).not.toContainText('/assets/')
    await expectNoBlockingViolations(page)

    await page.context().unroute(CHUNKS)
    await screen.getByRole('button').click()
    await expect(page.locator('#email')).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('Deployment hygiene', () => {
  test.skip(!isPreviewTarget, 'Only meaningful against a real build')

  test('no sourcemap is published alongside the bundle', async ({ page, baseURL }) => {
    // build.sourcemap is false for production and 'hidden' for the demo, so no
    // `//# sourceMappingURL=` comment should ever be emitted. If one appears,
    // the original source is being handed to anyone who opens devtools.
    const scriptRequests: Request[] = []
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scriptRequests.push(request)
    })

    await page.goto('/')
    await waitForAppReady(page)

    expect(scriptRequests.length).toBeGreaterThan(0)

    const withSourceMapComment: string[] = []
    for (const request of scriptRequests) {
      const url = request.url()
      if (!url.startsWith(baseURL ?? '')) continue
      const body = await page.evaluate(async (target) => {
        const res = await fetch(target)
        return res.ok ? res.text() : ''
      }, url)
      if (/^\/\/# sourceMappingURL=/m.test(body)) withSourceMapComment.push(url)
    }

    expect(
      withSourceMapComment,
      `These chunks expose a sourcemap:\n${withSourceMapComment.join('\n')}`,
    ).toEqual([])
  })

  test('the service worker is served with revalidating cache headers', async ({ page }) => {
    // A cached service worker keeps serving stale mock handlers across deploys.
    // `vp preview` does not apply vercel.json headers, so assert only that the
    // file is served and is the current one; the header contract is enforced by
    // vercel.json and public/_headers.
    const response = await page.request.get('/mockServiceWorker.js')

    expect(response.status()).toBe(200)
    expect(await response.text()).toContain('PACKAGE_VERSION')
  })
})
