import { expect, test, type Page, type Request } from '@playwright/test'

import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, expireSession, signOut } from './helpers/auth'

/**
 * The app served under a path prefix: `VUESTRATA_BASE_PATH=/console/`.
 *
 * Run it on its own, against a demo build made for that base:
 *
 *   E2E_BASE_PATH=/console/ E2E_TARGET=preview vp exec playwright test e2e/subpath.spec.ts
 *
 * (from Git Bash, with MSYS_NO_PATHCONV=1, or the shell turns the value into a
 * Windows path). Without `E2E_BASE_PATH` every test here is skipped: the rest
 * of the suite is the proof for an app at the root.
 *
 * Every URL below is written RELATIVE to the base (`auth/login`, not
 * `/auth/login`). Playwright resolves a leading slash against the origin,
 * which is exactly the mistake this file is here to catch in the app.
 */

const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
const BASE = env?.E2E_BASE_PATH ?? '/'

/** A route path as the address bar shows it under the base. */
const under = (path: string) => `${BASE}${path.replace(/^\//, '')}`
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The URL of `path` under the base, with nothing after it but a query or a hash. */
const at = (path: string) => new RegExp(`^https?://[^/]+${escaped(under(path))}(?:[?#].*)?$`)

test.describe.configure({ mode: 'serial', timeout: 90_000 })

test.describe('served under a base path', () => {
  test.skip(BASE === '/', 'E2E_BASE_PATH is not set: the app is at the root')

  /** Everything the page asks its own origin for, with the status it got. */
  function watchOwnOrigin(page: Page) {
    const seen: { path: string; status: number }[] = []
    const origin = () => new URL(page.url()).origin
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (page.url() !== 'about:blank' && url.origin !== origin()) return
      seen.push({ path: url.pathname, status: response.status() })
    })
    return seen
  }

  async function signIn(page: Page): Promise<void> {
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 })
    await page.locator('#email').fill(DEMO_ADMIN_EMAIL)
    await page.locator('#password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: /^sign in$/i }).click()
  }

  test('loads at the base, with every file of its own under it', async ({ page }) => {
    const seen = watchOwnOrigin(page)

    await page.goto('./', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.querySelector('#app')?.children.length)
    await page.goto('./auth/login', { waitUntil: 'networkidle' })

    expect(new URL(page.url()).pathname).toBe(under('/auth/login'))

    // The page, its scripts and styles, the runtime configuration, the icon.
    const paths = seen.map((entry) => entry.path)
    expect(paths).toContain(under('/runtime-config.js'))
    expect(paths.some((path) => path.startsWith(under('/assets/')))).toBe(true)

    // A headless browser draws no tab and never fetches the icon, so it is
    // asked for here, at the address the page gives.
    const icon = await page.locator('link[rel="icon"]').evaluate((link) => {
      return (link as HTMLLinkElement).href
    })
    expect(new URL(icon).pathname).toBe(under('/favicon.svg'))
    expect((await page.request.get(icon)).status()).toBe(200)

    // Nothing is asked of the root of the origin except the API, which is
    // independent of the base path (`VUESTRATA_API_URL=/api`).
    const outside = seen.filter(
      (entry) => !entry.path.startsWith(BASE) && !entry.path.startsWith('/api/'),
    )
    expect(outside).toEqual([])

    // And none of it is missing.
    expect(seen.filter((entry) => entry.status >= 400)).toEqual([])
  })

  test('serves the files nothing on the page links to under the base as well', async ({
    page,
    request,
  }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded' })

    const version = await request.get('./version.json')
    expect(version.status()).toBe(200)
    expect(await version.json()).toHaveProperty('release')

    const runtimeConfig = await request.get('./runtime-config.js')
    expect(runtimeConfig.status()).toBe(200)
    expect(runtimeConfig.headers()['content-type']).toMatch(/javascript/)

    // The manifest names its start URL, scope and icon relative to itself, so
    // they are under the base wherever that is.
    const manifestUrl = new URL('./site.webmanifest', page.url())
    const response = await request.get(manifestUrl.href)
    expect(response.status()).toBe(200)
    const manifest = (await response.json()) as {
      start_url: string
      scope: string
      icons: { src: string }[]
    }
    expect(new URL(manifest.start_url, manifestUrl).pathname).toBe(BASE)
    expect(new URL(manifest.scope, manifestUrl).pathname).toBe(BASE)
    const icon = new URL(manifest.icons[0]!.src, manifestUrl)
    expect(icon.pathname).toBe(under('/favicon.svg'))
    expect((await request.get(icon.href)).status()).toBe(200)

    // The same names at the root of the origin are not the app's.
    for (const path of ['/runtime-config.js', '/version.json', '/assets/']) {
      expect((await request.get(new URL(path, page.url()).href)).status(), path).not.toBe(200)
    }
  })

  test('registers the mock worker under the base, and it answers the API at the root', async ({
    page,
  }) => {
    await page.goto('./auth/login', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 })

    const worker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return {
        script: new URL(registration.active!.scriptURL).pathname,
        scope: new URL(registration.scope).pathname,
        controlled: navigator.serviceWorker.controller !== null,
      }
    })
    expect(worker.script).toBe(under('/mockServiceWorker.js'))
    // A worker's widest scope is the directory of its script: the base. That
    // decides which PAGES it controls, not which requests it sees, so a page
    // under the base has its calls to /api at the root answered.
    expect(worker.scope).toBe(BASE)
    expect(worker.controlled).toBe(true)

    const login = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/login' &&
        response.request().method() === 'POST',
    )
    await signIn(page)
    const response = await login
    expect(response.ok()).toBe(true)
    expect(response.fromServiceWorker()).toBe(true)
    await expect(page).toHaveURL(at('/dashboard'), { timeout: 15_000 })
  })

  test('keeps the prefix through navigation, a deep link and a hard reload', async ({ page }) => {
    await page.goto('./auth/login', { waitUntil: 'domcontentloaded' })
    await signIn(page)
    await expect(page).toHaveURL(at('/dashboard'), { timeout: 15_000 })

    // Client-side navigation: the router writes the prefix itself.
    await page
      .getByRole('navigation', { name: /sidebar/i })
      .getByRole('link', { name: 'Customers', exact: true })
      .click()
    await expect(page).toHaveURL(at('/dashboard/customers'))
    const heading = page.getByRole('heading', { level: 1 }).first()
    await expect(heading).toBeVisible()
    const title = await heading.textContent()

    // A hard reload asks the SERVER for the deep link, which must answer with
    // the app rather than a 404, and the app must find its files again.
    const failed: string[] = []
    page.on('response', (response) => {
      if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`)
    })
    const reloaded = await page.reload({ waitUntil: 'domcontentloaded' })
    expect(reloaded?.status()).toBe(200)
    await expect(page).toHaveURL(at('/dashboard/customers'))
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(title ?? '', {
      timeout: 30_000,
    })
    expect(failed).toEqual([])

    // Every link the shell renders is under the base.
    const hrefs = await page
      .getByRole('navigation', { name: /sidebar/i })
      .getByRole('link')
      .evaluateAll((links) =>
        links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
      )
    expect(hrefs.length).toBeGreaterThan(3)
    expect(hrefs.filter((href) => !href.startsWith(BASE))).toEqual([])
  })

  test('signing out lands on the login page under the base', async ({ page }) => {
    await page.goto('./auth/login', { waitUntil: 'domcontentloaded' })
    await signIn(page)
    await expect(page).toHaveURL(at('/dashboard'), { timeout: 15_000 })

    await signOut(page)

    await expect(page).toHaveURL(at('/auth/login'), { timeout: 15_000 })
  })

  test('a protected deep link goes to login and comes back, without doubling the prefix', async ({
    page,
  }) => {
    await page.goto('./dashboard/users', { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(at('/auth/login'), { timeout: 15_000 })
    // The destination is a path inside the app: no prefix in it.
    expect(new URL(page.url()).searchParams.get('redirect')).toBe('/dashboard/users')

    await signIn(page)
    await expect(page).toHaveURL(at('/dashboard/users'), { timeout: 15_000 })
    expect(new URL(page.url()).pathname).toBe(under('/dashboard/users'))
  })

  test('an expired session goes to login under the base and returns to the page', async ({
    page,
  }) => {
    await page.goto('./auth/login', { waitUntil: 'domcontentloaded' })
    await signIn(page)
    await expect(page).toHaveURL(at('/dashboard'), { timeout: 15_000 })
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible({ timeout: 30_000 })
    const acceptSessionsAgain = await expireSession(page)

    await page
      .getByRole('navigation', { name: /sidebar/i })
      .getByRole('link', { name: 'Users', exact: true })
      .click()

    await expect(page).toHaveURL(at('/auth/login'), { timeout: 15_000 })
    const query = new URL(page.url()).searchParams
    expect(query.get('reason')).toBe('expired')
    expect(query.get('redirect')).toBe('/dashboard/users')
    await expect(page.getByRole('status').filter({ hasText: /session expired/i })).toBeVisible()

    await acceptSessionsAgain()
    await signIn(page)
    await expect(page).toHaveURL(at('/dashboard/users'), { timeout: 15_000 })
  })

  test('the OAuth callback and its redirect_uri are under the base', async ({ page }) => {
    await page.goto('./auth/login', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 })

    const visited: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname)
    })
    const exchange = page.waitForRequest(
      (candidate: Request) =>
        new URL(candidate.url()).pathname === '/api/auth/token' && candidate.method() === 'POST',
      { timeout: 30_000 },
    )
    await page.getByRole('button', { name: /continue with google/i }).click()

    const body = (await exchange).postDataJSON() as { redirect_uri: string }
    const origin = new URL(page.url()).origin
    // The address the provider is told to come back to is the callback ROUTE
    // as the browser knows it, prefix included.
    expect(body.redirect_uri).toBe(`${origin}${under('/auth/callback')}`)
    expect(visited).toContain(under('/auth/callback'))
    await expect(page).toHaveURL(at('/dashboard'), { timeout: 15_000 })
  })
})
