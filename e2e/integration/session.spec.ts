import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * A cookie session in a real browser, against a backend that behaves like
 * Laravel with Sanctum (`e2e/helpers/stub-backend/server.mjs`).
 *
 * jsdom has no cookie jar worth trusting, so the integration tests
 * (`test/integration/auth/session-adapter.test.ts`) can only show which
 * requests the app makes. What a browser does with them is shown here: that
 * the session cookie is stored and sent, that JavaScript cannot read it, that
 * the CSRF cookie is read and decoded, and that a session which ends leaves
 * the visitor where they can get back to their work.
 *
 * The app is a production build made for `VUESTRATA_AUTH_ADAPTER=session`,
 * with the Sanctum presets selected in the two seeded files (`fixtures/`). Run
 * `node e2e/integration/build.mjs` first; see `playwright.config.ts` here.
 */

// The stub's one account. Kept in step with `STUB_ACCOUNT` in the stub backend,
// which is JavaScript and is not imported here for that reason alone.
const EMAIL = 'ada@example.test'
const PASSWORD = 'correct-horse'

const SESSION_COOKIE = 'laravel_session'
const TOKEN_COOKIE = 'XSRF-TOKEN'

/** What the stub recorded for one request it answered. */
interface Served {
  method: string
  path: string
  status: number
  /** The `X-XSRF-TOKEN` header. */
  xsrf: string | null
  /** The `XSRF-TOKEN` cookie as the browser sent it, still percent-encoded. */
  tokenCookie: string | null
  authorization: string | null
  session: string | null
}

const served = async (request: APIRequestContext): Promise<Served[]> =>
  (await request.get('/__stub/requests')).json()

/** The routes a session is made of. The dashboard's own calls are not the subject here. */
const SESSION_ROUTES = ['/sanctum/csrf-cookie', '/login', '/logout', '/api/user']
const ofSession = (requests: Served[]) =>
  requests.filter((entry) => SESSION_ROUTES.includes(entry.path))

/** `METHOD /path status`, the way the assertions below read them. */
const lines = (requests: Served[]) =>
  requests.map((entry) => `${entry.method} ${entry.path} ${entry.status}`)

/** Every request the page makes, with its headers, for as long as the test runs. */
function watchRequests(page: Page) {
  const seen: Array<{ method: string; url: string; headers: Record<string, string> }> = []
  page.on('request', (request) => {
    seen.push({ method: request.method(), url: request.url(), headers: request.headers() })
  })
  return seen
}

async function fillLogin(page: Page, password = PASSWORD) {
  await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 })
  await page.locator('#email').fill(EMAIL)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: /^sign in$/i }).click()
}

async function expectSignedIn(page: Page) {
  await expect(page.getByTestId('account-menu-trigger')).toBeVisible({ timeout: 30_000 })
}

async function signIn(page: Page) {
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
  await fillLogin(page)
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 15_000 })
  await expectSignedIn(page)
}

test.beforeEach(async ({ request }) => {
  await request.post('/__stub/reset')
})

test.describe('a server session, in a browser', () => {
  test('signs in: the CSRF cookie first, then the credentials with the token, then the user', async ({
    page,
    context,
    request,
  }) => {
    const seen = watchRequests(page)

    await signIn(page)

    const backend = ofSession(await served(request))
    expect(lines(backend)).toEqual([
      // The boot asks whether the cookie the browser holds is a session. It holds none.
      'GET /api/user 401',
      'GET /sanctum/csrf-cookie 204',
      'POST /login 204',
      'GET /api/user 200',
    ])

    const [, primed, login, me] = backend
    // The token in the header is the cookie's value DECODED, and the backend
    // accepted it (a 204, not a 419).
    expect(login!.tokenCookie).toContain('%3D')
    expect(login!.xsrf).toBe(decodeURIComponent(login!.tokenCookie!))
    expect(login!.xsrf).not.toBe(login!.tokenCookie)
    expect(primed!.xsrf).toBeNull()
    expect(seen.some((entry) => entry.method === 'POST' && entry.url.endsWith('/login'))).toBe(true)

    // A new session id with the sign-in: the one the form was sent under is gone.
    expect(login!.session).toBeTruthy()
    expect(me!.session).toBeTruthy()
    expect(me!.session).not.toBe(login!.session)

    // The session cookie is the browser's alone.
    const cookies = await context.cookies()
    const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE)
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax' })
    expect(session!.value).toBe(me!.session)
    expect(cookies.find((cookie) => cookie.name === TOKEN_COOKIE)).toMatchObject({
      httpOnly: false,
    })
    const visible = await page.evaluate(() => document.cookie)
    expect(visible).toContain(TOKEN_COOKIE)
    expect(visible).not.toContain(SESSION_COOKIE)
    expect(visible).not.toContain(session!.value)
  })

  test('holds no token anywhere JavaScript can read, and never sends Authorization', async ({
    page,
    context,
  }) => {
    const seen = watchRequests(page)

    await signIn(page)
    await page.goto('/dashboard/customers', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Analytical Engines Ltd')).toBeVisible({ timeout: 15_000 })

    expect(seen.length).toBeGreaterThan(10)
    for (const entry of seen) {
      expect(entry.headers.authorization, entry.url).toBeUndefined()
    }

    const cookies = await context.cookies()
    const secrets = [SESSION_COOKIE, TOKEN_COOKIE]
      .map((name) => cookies.find((cookie) => cookie.name === name)?.value)
      .filter((value): value is string => Boolean(value))
    expect(secrets).toHaveLength(2)

    const storage = await page.evaluate(async () => {
      const entries = (area: Storage) =>
        Array.from({ length: area.length }, (_, index) => {
          const key = area.key(index) ?? ''
          return [key, area.getItem(key) ?? ''] as const
        })
      return {
        local: entries(localStorage),
        session: entries(sessionStorage),
        databases: (await indexedDB.databases()).map((database) => database.name ?? ''),
      }
    })
    const stored = JSON.stringify([storage.local, storage.session])
    for (const secret of secrets) {
      expect(stored).not.toContain(secret)
      expect(stored).not.toContain(decodeURIComponent(secret))
    }
    for (const [key] of [...storage.local, ...storage.session]) {
      expect(key).not.toMatch(/token|refresh|session|credential/i)
    }
    // The demo keeps its session in IndexedDB. A production build has no such store.
    expect(storage.databases.filter((name) => /auth|session|token/i.test(name))).toEqual([])
  })

  test('stays signed in across a reload, by asking who the cookie belongs to', async ({
    page,
    request,
  }) => {
    await signIn(page)
    const before = (await served(request)).length

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expectSignedIn(page)
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/)
    const session = ofSession((await served(request)).slice(before))
    // One question, answered yes. No sign-in, and no token fetched for a read.
    expect(lines(session)).toEqual(['GET /api/user 200'])
  })

  test('replays a write the backend refused over a stale token, once, and it succeeds', async ({
    page,
    request,
  }) => {
    await signIn(page)
    await page.goto('/dashboard/customers/new', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('input[name="company"]')).toBeVisible({ timeout: 15_000 })
    await page.locator('input[name="company"]').fill('Difference Engine Co')
    await page.locator('input[name="contactName"]').fill('Ada Lovelace')
    await page.locator('input[name="email"]').fill('ada@difference.example')
    await page.locator('input[name="phone"]').fill('+44 20 7946 0001')
    await page.locator('input[name="city"]').fill('London')
    for (const [field, option] of [
      ['Status', 'Active'],
      ['Plan', 'Growth'],
    ] as const) {
      await page.getByRole('combobox', { name: field }).click()
      await page.getByRole('option', { name: option, exact: true }).click()
    }

    // The backend regenerates its token; the page still holds the old cookie.
    await request.post('/__stub/stale-token')
    const before = (await served(request)).length
    await page.getByRole('button', { name: /create customer/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/customers\/CUS-1001$/, { timeout: 15_000 })
    await expect(page.getByText('Difference Engine Co').first()).toBeVisible()
    const after = (await served(request)).slice(before)
    expect(lines(after).slice(0, 3)).toEqual([
      'POST /api/customers 419',
      'GET /sanctum/csrf-cookie 204',
      'POST /api/customers 201',
    ])
    // Sent twice and no more: one refusal, one replay.
    expect(after.filter((entry) => entry.method === 'POST')).toHaveLength(2)
    expect(after[0]!.xsrf).not.toBe(after[2]!.xsrf)
  })

  test('sends an expired session to sign in again, and back to where it was', async ({
    page,
    request,
  }) => {
    const seen = watchRequests(page)
    await signIn(page)
    // On a page whose data has arrived and that asks for nothing more by
    // itself, so the request that finds out is the one made below. (The
    // dashboard keeps retrying the panels this stub has no data for, and one
    // of those would find out first.)
    await page.goto('/dashboard/customers', { waitUntil: 'domcontentloaded' })
    const record = page.getByRole('link', { name: 'Analytical Engines Ltd' }).first()
    await expect(record).toBeVisible({ timeout: 15_000 })

    // The server session runs out while the app is open.
    await request.post('/__stub/expire-session')
    const before = (await served(request)).length
    await record.click()

    await expect(page).toHaveURL(/\/auth\/login\?/, { timeout: 15_000 })
    const landed = new URL(page.url())
    expect(landed.searchParams.get('reason')).toBe('expired')
    expect(landed.searchParams.get('redirect')).toBe('/dashboard/customers/CUS-1000')
    await expect(page.getByRole('status').filter({ hasText: /session expired/i })).toBeVisible()

    // The request that found out, and nothing sent to renew anything.
    const after = (await served(request)).slice(before)
    expect(lines(after)).toContain('GET /api/customers/CUS-1000 401')
    expect(after.filter((entry) => entry.status === 401).length).toBeGreaterThanOrEqual(1)
    expect(seen.filter((entry) => /refresh/i.test(new URL(entry.url).pathname))).toEqual([])
    expect(lines(after).filter((line) => line.startsWith('POST'))).toEqual([])

    await fillLogin(page)

    await expect(page).toHaveURL(/\/dashboard\/customers\/CUS-1000$/, { timeout: 15_000 })
    await expect(page.getByText('Analytical Engines Ltd').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('signs out, and a later reload stays signed out', async ({ page, context, request }) => {
    await signIn(page)
    const signedIn = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
    const before = (await served(request)).length

    await page.getByTestId('account-menu-trigger').click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()

    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 })
    const logout = (await served(request)).slice(before).find((entry) => entry.path === '/logout')
    expect(logout).toMatchObject({ method: 'POST', status: 204 })
    expect(logout!.xsrf).toBeTruthy()
    // The backend replaced the session; the old id means nothing now.
    const signedOut = (await context.cookies()).find((cookie) => cookie.name === SESSION_COOKIE)
    expect(signedOut?.value).not.toBe(signedIn?.value)

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 })
    await expect(page.locator('#email')).toBeVisible()
    // Signed out, not expired: nobody is told their session ran out.
    expect(new URL(page.url()).searchParams.get('reason')).toBeNull()
    expect(lines(ofSession(await served(request))).at(-1)).toBe('GET /api/user 401')
  })

  test('shows the backend’s own message for wrong credentials', async ({ page, request }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })

    await fillLogin(page, 'not-the-password')

    await expect(page.getByText('These credentials do not match our records.')).toBeVisible({
      timeout: 15_000,
    })
    await expect(page).toHaveURL(/\/auth\/login/)
    expect(lines(ofSession(await served(request)))).toEqual([
      'GET /api/user 401',
      'GET /sanctum/csrf-cookie 204',
      'POST /login 422',
    ])

    // And the right password, straight after, signs in.
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 15_000 })
    await expectSignedIn(page)
  })
})
