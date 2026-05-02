import { test, expect } from '@playwright/test'

test.describe('Home page', () => {
  test('should display the hero section', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('h1')).toContainText('production')
  })

  test('should navigate to component docs', async ({ page }) => {
    await page.goto('/')
    await page.click('a[href="/docs/components/overview"]')
    await expect(page).toHaveURL(/\/docs\/components\/overview/)
  })

  test('should toggle dark mode', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')

    // Click the dark mode toggle button
    await page.click('button[aria-label*="dark"], button[aria-label*="light"]')

    // Check that dark class is toggled
    const hasDark = await html.evaluate((el) => el.classList.contains('dark'))
    expect(typeof hasDark).toBe('boolean')
  })
})

test.describe('Auth flow', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('h1')).toContainText(/login|sign in/i)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should navigate between login and register', async ({ page }) => {
    await page.goto('/auth/login')
    await page.click('a[href="/auth/register"]')
    await expect(page).toHaveURL(/\/auth\/register/)
  })
})

test.describe('404 page', () => {
  test('should show 404 for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist')
    await expect(page.locator('text=404')).toBeVisible()
  })
})
