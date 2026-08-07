import { test, expect, type Page } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

/**
 * Sidebar, breadcrumb, and command-palette mechanism.
 *
 * These assert the *mechanism* rather than any one module's links: that groups
 * render, that a nested section discloses, that active state follows the route,
 * that the breadcrumb reflects where you are, and — the rule the brief states
 * outright — that every advertised destination actually resolves.
 *
 * A test that hardcoded "Orders is the third item" would break on every reorder
 * without ever catching a real defect, so nothing here depends on position.
 */

async function gotoDashboard(page: Page): Promise<void> {
  await logInAsDemoAdmin(page)
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('navigation', { name: /sidebar/i })).toBeVisible()
}

function sidebarOf(page: Page) {
  return page.getByRole('navigation', { name: /sidebar/i })
}

test.describe('sidebar structure', () => {
  test('renders grouped sections with headings', async ({ page }) => {
    await gotoDashboard(page)
    const sidebar = sidebarOf(page)

    // Groups come from the registry; at minimum the sections the default
    // modules contribute to must be present and labelled.
    for (const heading of ['Overview', 'Commerce', 'Work', 'Organization', 'Account']) {
      await expect(sidebar.getByText(heading, { exact: true })).toBeVisible()
    }
  })

  test('marks only the current section as the current page', async ({ page }) => {
    await gotoDashboard(page)
    await page.goto('/dashboard/customers')

    const sidebar = sidebarOf(page)
    await expect(sidebar.getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // The overview entry is `exact`, so it must NOT claim to be the current
    // page merely because every dashboard path starts with `/dashboard`.
    await expect(sidebar.getByRole('link', { name: 'Dashboard', exact: true })).not.toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('keeps a section active on its own detail pages', async ({ page }) => {
    await gotoDashboard(page)
    await page.goto('/dashboard/customers/CUS-1000')

    // Prefix matching: a detail page still belongs to its section.
    await expect(sidebarOf(page).getByRole('link', { name: 'Customers' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('a nested section discloses and its children navigate', async ({ page }) => {
    await gotoDashboard(page)
    const sidebar = sidebarOf(page)

    const trigger = sidebar.getByRole('button', { name: 'Orders' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await sidebar.getByRole('link', { name: 'New order' }).click()
    await expect(page).toHaveURL(/\/dashboard\/orders\/new$/)
  })

  test('auto-expands the section containing the current page', async ({ page }) => {
    await gotoDashboard(page)
    await page.goto('/dashboard/orders/new')

    // Seeded open from the active route: landing deep in a section should not
    // require the user to find and open that section themselves.
    await expect(sidebarOf(page).getByRole('button', { name: 'Orders' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  test('every sidebar destination resolves to a real page', async ({ page }) => {
    // This test deliberately performs a full load of every destination — that
    // is the point of it — so it needs a budget proportional to the number of
    // pages rather than the default single-interaction one. Splitting it per
    // link would lose the property being asserted: that the set is complete.
    test.slow()

    await gotoDashboard(page)
    const sidebar = sidebarOf(page)

    // Expand every disclosure so nested links are reachable.
    for (const trigger of await sidebar.getByRole('button').all()) {
      if ((await trigger.getAttribute('aria-expanded')) === 'false') await trigger.click()
    }

    const targets = new Set<string>()
    for (const link of await sidebar.getByRole('link').all()) {
      const href = await link.getAttribute('href')
      if (href?.startsWith('/dashboard')) targets.add(href)
    }

    // Sanity floor: if the sidebar collapsed to nothing, the loop below would
    // pass vacuously.
    expect(targets.size).toBeGreaterThan(8)

    // No sidebar link may point at a page that does not exist. A 404, or a
    // bounce to /403, is a broken promise.
    for (const href of targets) {
      await page.goto(href)
      await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
      await expect(page, `${href} redirected away`).toHaveURL(new RegExp(`${href}(\\?|$)`))
      await expect(page.locator('h1').first(), `${href} rendered no heading`).toBeVisible()
    }
  })
})

test.describe('breadcrumb', () => {
  test('reflects the path and links back to the section', async ({ page }) => {
    await gotoDashboard(page)
    await page.goto('/dashboard/customers/CUS-1000')

    const breadcrumb = page.getByRole('navigation', { name: /breadcrumb/i })
    await expect(breadcrumb).toBeVisible()

    // The trailing crumb is replaced with the loaded entity, so it must not
    // still read as the raw id.
    await expect(breadcrumb.locator('[aria-current="page"]')).not.toHaveText('CUS-1000')

    await breadcrumb.getByRole('link', { name: 'Customers' }).click()
    await expect(page).toHaveURL(/\/dashboard\/customers$/)
  })
})

test.describe('command palette', () => {
  test('opens with the keyboard shortcut and navigates', async ({ page }) => {
    await gotoDashboard(page)

    // ControlOrMeta maps to ⌘ on macOS and Ctrl elsewhere — the same
    // distinction `useMagicKeys` handles on the app side.
    await page.keyboard.press('ControlOrMeta+k')

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    await dialog.getByRole('textbox').fill('Calendar')
    await dialog
      .getByRole('button', { name: /calendar/i })
      .first()
      .click()

    await expect(page).toHaveURL(/\/dashboard\/calendar$/)
  })

  test('opens from its button, for users who never learn the chord', async ({ page }) => {
    await gotoDashboard(page)

    await page.getByTestId('command-palette-trigger').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })
})
