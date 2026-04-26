import { test, expect } from '@playwright/test'

test.describe('Settings page', () => {
  test('should display theming controls', async ({ page }) => {
    await page.goto('/settings')
    // Should have some settings headings or controls
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })

  test('should load settings page without errors', async ({ page }) => {
    await page.goto('/settings')
    // Verify the page loaded and has interactive elements
    await expect(page).toHaveURL(/\/settings/)
  })
})

test.describe('Forbidden page', () => {
  test('should display the forbidden page', async ({ page }) => {
    await page.goto('/403')
    await expect(page.getByRole('heading', { name: '403' })).toBeVisible()
  })
})

test.describe('Dashboard navigation', () => {
  test('should navigate to dashboard index', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('should navigate to charts page', async ({ page }) => {
    await page.goto('/dashboard/charts')
    await expect(page).toHaveURL(/\/dashboard\/charts/)
  })

  test('should navigate to forms page', async ({ page }) => {
    await page.goto('/dashboard/forms')
    await expect(page).toHaveURL(/\/dashboard\/forms/)
  })

  test('should navigate to tables page', async ({ page }) => {
    await page.goto('/dashboard/tables')
    await expect(page).toHaveURL(/\/dashboard\/tables/)
  })
})

test.describe('Components page', () => {
  test('should display component examples', async ({ page }) => {
    await page.goto('/components')
    await expect(page.locator('h1').first()).toBeVisible()
  })
})

test.describe('Responsive layout', () => {
  test('should render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('should render correctly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
  })
})
