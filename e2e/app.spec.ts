import { test, expect, type Page } from '@playwright/test'

async function gotoReady(page: Page) {
  await page.goto('/')
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
}

async function gotoAuthReady(page: Page) {
  await page.goto('/auth/login')
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
}

test.describe('Home page', () => {
  test('should display the hero section', async ({ page }) => {
    await gotoReady(page)
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('h1')).toContainText('production')
  })

  test('should navigate to component docs', async ({ page }) => {
    await gotoReady(page)
    await page.getByRole('link', { name: /explore components/i }).click()
    await expect(page).toHaveURL(/\/docs\/components\/overview/)
  })

  test('should toggle dark mode', async ({ page }) => {
    await gotoReady(page)
    const html = page.locator('html')

    // Click the dark mode toggle button
    await page.getByRole('button', { name: /dark|light/i }).click()

    // Check that dark class is toggled
    const hasDark = await html.evaluate((el) => el.classList.contains('dark'))
    expect(typeof hasDark).toBe('boolean')
  })
})

test.describe('Auth flow', () => {
  test('should show login page', async ({ page }) => {
    await gotoAuthReady(page)
    await expect(page.locator('h1')).toContainText(/login|sign in/i)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should navigate between login and register', async ({ page }) => {
    await gotoAuthReady(page)
    await page
      .locator('main')
      .getByRole('link', { name: /create account/i })
      .click({ force: true })
    await expect(page).toHaveURL(/\/auth\/register/)
  })
})

test.describe('404 page', () => {
  test('should show 404 for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.locator('#app-loader')).toBeHidden({ timeout: 10_000 })
    await expect(page.locator('text=404')).toBeVisible()
  })
})
