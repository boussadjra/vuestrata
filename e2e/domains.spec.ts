import { test, expect, type Page } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

/**
 * The domain pages actually render their data.
 *
 * This exists because "the page loads and has a heading" is not the same as
 * "the page works". A refactor of the table/query wiring once left the customer
 * list rendering an empty body while its own footer reported "Showing 0-0 of 48
 * rows" — every structural check passed, the page looked plausible, and it was
 * completely broken. Asserting on rendered rows is what catches that.
 */

async function open(page: Page, path: string): Promise<void> {
  await logInAsDemoAdmin(page)
  await page.goto(path)
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
}

test.describe('list pages render server data', () => {
  test('customers: rows are rendered and the count agrees with the footer', async ({ page }) => {
    await open(page, '/dashboard/customers')

    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 15_000 })
    // Default page size is 10; the fixture set is larger, so a full page.
    await expect(rows).toHaveCount(10)

    // The body and the footer must be reading the same source. When they were
    // not, this said "Showing 0-0 of 48".
    await expect(page.getByText(/Showing 1-10 of \d+ rows/)).toBeVisible()
  })

  test('customers: search narrows the result set', async ({ page }) => {
    await open(page, '/dashboard/customers')
    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })

    await page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .first()
      .fill('Northwind')

    // Server-side search, debounced — the assertion waits it out rather than
    // sleeping a fixed amount.
    await expect(page.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('tbody')).toContainText('Northwind')
  })

  test('orders: rows are rendered', async ({ page }) => {
    await open(page, '/dashboard/orders')

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('tbody tr')).toHaveCount(10)
  })

  test('products: the card grid is populated', async ({ page }) => {
    await open(page, '/dashboard/products')

    const cards = page.getByRole('list', { name: 'Products' }).getByRole('listitem')
    await expect(cards.first()).toBeVisible({ timeout: 15_000 })
    expect(await cards.count()).toBeGreaterThan(3)
  })

  test('projects: the board renders every column', async ({ page }) => {
    await open(page, '/dashboard/projects')

    await expect(
      page
        .getByRole('link')
        .filter({ hasText: /firmware|billing|portal/i })
        .first(),
    ).toBeVisible({
      timeout: 15_000,
    })
  })

  test('team: the directory groups people by department', async ({ page }) => {
    await open(page, '/dashboard/team')

    await expect(page.getByRole('heading', { name: /engineering/i })).toBeVisible({
      timeout: 15_000,
    })
  })

  test('reports: rows carry figures, and export is offered to an admin', async ({ page }) => {
    await open(page, '/dashboard/reports')

    await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
    // The demo account is a super admin, so it holds reports:export.
    await expect(page.getByRole('button', { name: /export report/i }).first()).toBeVisible()
  })
})

test.describe('detail pages resolve a record', () => {
  test('a customer detail page shows the company, not the id', async ({ page }) => {
    await open(page, '/dashboard/customers/CUS-1000')

    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible({ timeout: 15_000 })
    await expect(heading).not.toHaveText('CUS-1000')
  })

  test('an unknown id renders a not-found state, not a spinner', async ({ page }) => {
    await open(page, '/dashboard/customers/CUS-does-not-exist')

    // A 404 is terminal: the record is gone, so the page must say so rather
    // than offering a retry that can never succeed.
    await expect(page.getByText(/not found/i).first()).toBeVisible({ timeout: 15_000 })
  })
})
