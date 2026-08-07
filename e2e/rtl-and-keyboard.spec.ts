import { test, expect, type Page } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

/**
 * RTL layout and keyboard navigation.
 *
 * Neither is reachable by an automated rule engine: axe can tell you a control
 * has no accessible name, but not that Tab escapes an open drawer, that focus
 * vanishes on route change, or that a sidebar mirrors to the wrong edge in
 * Arabic. These are the behaviours that decide whether the app is usable
 * without a mouse.
 */

const APPEARANCE_KEYS = {
  dark: 'vuestrata-dark',
  theme: 'vuestrata-theme',
  locale: 'vuestrata-locale',
}

async function setLocale(page: Page, locale: 'en' | 'ar') {
  // Written pre-boot: `bootstrapTheme()` reads this before mount to set
  // html[dir], so a post-navigation write would need a reload.
  // Raw string, not JSON — appearance.ts compares the stored value directly.
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: APPEARANCE_KEYS.locale,
    value: locale,
  })
}

async function gotoAndSettle(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 })
}

test.describe('RTL layout', () => {
  test.beforeEach(async ({ page }) => {
    await logInAsDemoAdmin(page)
    await setLocale(page, 'ar')
  })

  test('sets dir and lang on the document', async ({ page }) => {
    await gotoAndSettle(page, '/dashboard')

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  })

  test('mirrors the sidebar to the right edge', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoAndSettle(page, '/dashboard')

    const sidebar = page.locator('aside[role="navigation"]')
    const box = await sidebar.boundingBox()
    const viewport = page.viewportSize()!

    expect(box, 'sidebar should be rendered').not.toBeNull()
    // Logical `inset-s-0` must resolve to the right edge under dir=rtl. If the
    // sidebar is still hard-left, a physical utility survived the sweep.
    expect(box!.x + box!.width).toBeCloseTo(viewport.width, -1)
  })

  test('does not overflow horizontally', async ({ page }) => {
    // A stray physical margin in RTL typically shows up as a horizontal
    // scrollbar rather than an obviously broken layout.
    await page.setViewportSize({ width: 1280, height: 900 })
    await gotoAndSettle(page, '/dashboard')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow, 'page should not scroll horizontally in RTL').toBeLessThanOrEqual(1)
  })
})

test.describe('Keyboard navigation', () => {
  test('the first Tab reaches the skip link, which jumps to main', async ({ page }) => {
    await gotoAndSettle(page, '/')

    await page.keyboard.press('Tab')

    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
    await expect(focused).toHaveAttribute('href', /#main-content/)

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#main-content/)
  })

  test('a visible focus indicator is painted on the focused element', async ({ page }) => {
    await gotoAndSettle(page, '/auth/login')
    await page.locator('#email').focus()

    const outlineWidth = await page
      .locator('#email')
      .evaluate((el) => getComputedStyle(el).outlineWidth)

    // The global *:focus-visible rule must actually resolve to a painted ring;
    // components that set `focus-visible:outline-none` without a replacement
    // would report 0px here.
    expect(Number.parseFloat(outlineWidth)).toBeGreaterThan(0)
  })
})

test.describe('Mobile navigation drawer', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('traps focus while open and restores it on close', async ({ page }) => {
    await logInAsDemoAdmin(page)
    await gotoAndSettle(page, '/dashboard')

    // Target the mobile toggle explicitly — both toggles carry the same
    // accessible name, and only one is rendered at this viewport.
    await page.getByTestId('mobile-sidebar-toggle').click()

    const sidebar = page.locator('aside[role="navigation"]')
    await expect(sidebar).toHaveAttribute('aria-modal', 'true')

    // Tab repeatedly; focus must never leave the drawer.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      const insideDrawer = await page.evaluate(() => {
        const aside = document.querySelector('aside[role="navigation"]')
        return !!aside && aside.contains(document.activeElement)
      })
      expect(insideDrawer, `focus escaped the drawer after ${i + 1} tab(s)`).toBe(true)
    }

    // Esc is the conventional dismissal, and the only exit once focus is trapped.
    await page.keyboard.press('Escape')
    await expect(sidebar).not.toHaveAttribute('aria-modal', 'true')
  })

  test('is removed from the tab order while closed', async ({ page }) => {
    await logInAsDemoAdmin(page)
    await gotoAndSettle(page, '/dashboard')

    // Closed, the drawer is only translated off-screen. Without `inert` its
    // links stay focusable and a keyboard user tabs into an invisible menu.
    const sidebar = page.locator('aside[role="navigation"]')
    await expect(sidebar).toHaveAttribute('inert', '')
  })
})
