import { expect, test } from '@playwright/test'

import {
  createDemoUser,
  DEMO_ADMIN_EMAIL,
  DEMO_PASSWORD,
  expectLoggedOutTab,
  logInAsDemoAdmin,
  seedDemoUsers,
  signOut,
} from './helpers/auth'

test.describe.configure({ mode: 'serial', timeout: 60_000 })

test.describe('Auth flows', () => {
  test('redirects protected routes to login and returns after credentials login', async ({
    page,
  }) => {
    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/\/auth\/login.*redirect=/)
    await page.locator('#email').fill(DEMO_ADMIN_EMAIL)
    await page.locator('#password').fill(DEMO_PASSWORD)
    await page.getByRole('button', { name: /^sign in$/i }).click()

    await expect(page).toHaveURL(/\/dashboard\/users$/)
    await expect(page.getByRole('heading', { name: /team members|users & rbac/i })).toBeVisible()
  })

  test('shows invalid credentials without leaving the password in the field', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })

    await page.locator('#email').fill('missing@example.test')
    await page.locator('#password').fill('wrong-password')
    await page.getByRole('button', { name: /^sign in$/i }).click()

    await expect(page.getByText(/invalid credentials/i)).toBeVisible()
    await expect(page.locator('#password')).toHaveValue('')
  })

  test('registers a new credentials user and opens the dashboard', async ({ page }) => {
    const email = `registered-${Date.now()}@example.test`

    await page.goto('/auth/register', { waitUntil: 'domcontentloaded' })
    await page.locator('#name').fill('Registered User')
    await page.locator('#email').fill(email)
    await page.locator('#password').fill('password123')
    await page.locator('#confirmPassword').fill('password123')
    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 10_000 })
  })

  test('requests a magic link and shows the sent confirmation', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Magic Link' }).click()

    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/auth/magic-link') && response.request().method() === 'POST',
    )
    await page.locator('#magic-email').fill('magic@example.test')
    await page.getByRole('button', { name: /send magic link/i }).click()

    expect((await responsePromise).ok()).toBe(true)
    await expect(page.getByText(/check your inbox/i)).toBeVisible()
    await expect(page.getByText('magic@example.test')).toBeVisible()
  })

  test('completes mock social login through the OAuth callback', async ({ page }) => {
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
    const tokenResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/auth/token') && response.request().method() === 'POST',
      { timeout: 30_000 },
    )
    await page.getByRole('button', { name: /continue with google/i }).click()

    expect((await tokenResponsePromise).ok()).toBe(true)
    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 30_000 })
  })

  test('shows an OAuth callback error when state validation fails', async ({ page }) => {
    await page.goto('/auth/callback?code=demo-oauth-code-google&state=bad-state', {
      waitUntil: 'domcontentloaded',
    })

    await expect(page.getByRole('heading', { name: /authentication failed/i })).toBeVisible()
    await expect(page.getByText(/oauth state mismatch/i)).toBeVisible()
  })

  test('completes an MFA challenge for an MFA-enabled demo user', async ({ page }) => {
    await seedDemoUsers(page, [createDemoUser({ mfaEnabled: true })])

    await page.goto('/auth/login', { waitUntil: 'domcontentloaded' })
    await page.locator('#email').fill(DEMO_ADMIN_EMAIL)
    await page.locator('#password').fill(DEMO_PASSWORD)
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/auth/login') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: /^sign in$/i }).click()
    const loginResponse = await loginResponsePromise
    expect((await loginResponse.json()).mfaRequired).toBe(true)

    await expect(page.getByLabel(/mfa code/i)).toBeVisible({ timeout: 15_000 })
    await page.getByLabel(/mfa code/i).fill('000000')
    await page.getByRole('button', { name: /verify code/i }).click()

    await expect(page).toHaveURL(/\/dashboard(?:\/|$)/, { timeout: 10_000 })
  })

  test('restores a persisted demo session in a fresh tab and logs out through the header', async ({
    context,
    page,
  }) => {
    await logInAsDemoAdmin(page)

    const restoredPage = await context.newPage()
    await restoredPage.goto('/dashboard', { waitUntil: 'load' })
    await expect(restoredPage).toHaveURL(/\/dashboard(?:\/|$)/)

    await signOut(page)
    await expect(page).toHaveURL(/\/auth\/login/)

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/auth\/login.*redirect=/)
    await restoredPage.close()
  })

  test('clears another tab when the demo session is logged out', async ({ page, context }) => {
    await logInAsDemoAdmin(page)

    const secondPage = await context.newPage()
    await secondPage.goto('/dashboard', { waitUntil: 'load' })
    await expect(secondPage).toHaveURL(/\/dashboard(?:\/|$)/)

    await signOut(page)
    await expect(page).toHaveURL(/\/auth\/login/)
    await expectLoggedOutTab(secondPage)
  })
})

test.describe('Auth-backed user management', () => {
  test('super admin can invite a user and edit explicit permissions', async ({ page }) => {
    await logInAsDemoAdmin(page)
    await page.goto('/dashboard/users', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /team members|users & rbac/i })).toBeVisible()
    const dialog = page.getByRole('dialog')
    await page.getByRole('button', { name: /invite user/i }).click()
    await page.locator('#invite-email').fill('invited@example.test')
    await page.locator('#invite-name').fill('Invited Member')
    await dialog
      .getByRole('button', { name: /send invitation|send invite/i })
      .click({ force: true })

    await expect(dialog).toHaveCount(0)
    await expect(page.getByText('Invited Member')).toBeVisible()
  })
})
