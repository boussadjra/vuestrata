import { test, expect, type Page } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

async function openDocsSidebarIfNeeded(page: Page) {
  const toggleButton = page.getByRole('button', { name: /toggle documentation navigation/i })
  if (await toggleButton.isVisible()) {
    await toggleButton.click({ force: true })
  }
}

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await logInAsDemoAdmin(page)
  })

  test('should display theming controls', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/dashboard\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Theme' })).toBeVisible()
  })

  test('should load settings page without errors', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/dashboard\/settings/)
    await expect(page.getByRole('button', { name: 'Default' })).toBeVisible()
  })
})

test.describe('Forbidden page', () => {
  test('should display the forbidden page', async ({ page }) => {
    await page.goto('/403')
    await expect(page.getByRole('heading', { name: '403' })).toBeVisible()
  })
})

test.describe('Dashboard navigation', () => {
  test.beforeEach(async ({ page }) => {
    await logInAsDemoAdmin(page)
  })

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
    await page.getByRole('link', { name: /form docs and examples/i }).click()
    await expect(page).toHaveURL(/\/docs\/components\/forms/)
  })

  test('should navigate to tables page', async ({ page }) => {
    await page.goto('/dashboard/tables')
    await expect(page).toHaveURL(/\/dashboard\/tables/)
    await page.getByRole('link', { name: /data table docs and examples/i }).click()
    await expect(page).toHaveURL(/\/docs\/components\/data-tables/)
  })
})

test.describe('Components page', () => {
  test('should redirect to component docs', async ({ page }) => {
    await page.goto('/components')
    await expect(page).toHaveURL(/\/docs\/components\/overview/)
    await expect(page.getByRole('heading', { name: 'Components', exact: true })).toBeVisible()
  })

  test('should redirect form builder guide to nested docs', async ({ page }) => {
    await page.goto('/components/forms/form-builder')
    await expect(page).toHaveURL(/\/docs\/components\/forms\/form-builder/)
    await expect(page.getByRole('heading', { name: 'Form Builder', exact: true })).toBeVisible()
  })

  test('should show collapsed component demo tree in docs sidebar', async ({ page }) => {
    await page.goto('/docs/components/overview')
    const docsNav = page.getByRole('navigation', { name: 'Documentation' })
    await expect(page.getByRole('heading', { name: 'Overview', exact: true }).first()).toBeVisible()
    await openDocsSidebarIfNeeded(page)
    await expect(docsNav).toBeVisible()
    const componentTopLevelLabels = await docsNav
      .locator(
        '[aria-labelledby="docs-section-components"] > li > a, [aria-labelledby="docs-section-components"] > li > button',
      )
      .evaluateAll((elements) =>
        elements.map((element) => element.textContent?.trim()).filter(Boolean),
      )

    expect(componentTopLevelLabels.slice(0, 6)).toEqual([
      'Overview',
      'Forms',
      'Data Display',
      'Navigation',
      'Feedback',
      'Layout & Overlays',
    ])

    await expect(docsNav.getByRole('button', { name: 'Forms' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await expect(docsNav.getByRole('button', { name: 'Data Display' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )

    await docsNav.getByRole('button', { name: 'Forms' }).click({ force: true })
    await expect(docsNav.getByRole('link', { name: 'Button', exact: true })).toBeVisible()

    await docsNav.getByRole('button', { name: 'Data Display' }).click({ force: true })
    await expect(docsNav.getByRole('link', { name: 'DataTable', exact: true })).toBeVisible()

    await docsNav.getByRole('link', { name: 'Button', exact: true }).click({ force: true })
    await expect(page).toHaveURL(/\/docs\/components\/demos\/buttons/)
    await expect(page.getByRole('heading', { name: 'Button', exact: true }).first()).toBeVisible()
  })

  test('should redirect legacy component demos into docs shell', async ({ page }) => {
    await page.goto('/components/buttons')
    await expect(page).toHaveURL(/\/docs\/components\/demos\/buttons/)
    await expect(page.getByRole('heading', { name: 'Button', exact: true }).first()).toBeVisible()
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
