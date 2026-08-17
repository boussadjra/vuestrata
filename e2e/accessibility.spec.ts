import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

/**
 * Automated accessibility audit.
 *
 * Two things changed here beyond adding pages:
 *
 * 1. **A readiness wait.** `page.goto()` resolves on document load, not on the
 *    Vue app mounting. Auditing immediately raced the first render — against a
 *    built preview axe ran over a half-rendered tree, and against the dev
 *    server it often ran over nothing at all. A suite that audits an empty page
 *    passes every time while testing nothing.
 *
 * 2. **`serious` is now a failure, not just `critical`.** Most real barriers —
 *    insufficient contrast, a missing form label, an unlabelled control — are
 *    classified `serious`. Asserting only on `critical` let all of them through.
 *
 * Axe cannot judge focus order, whether an announcement makes sense, or whether
 * a chart is comprehensible. See `docs/7.testing/` for the manual checklist.
 */

const BLOCKING_IMPACTS = new Set(['critical', 'serious'])

/** Appearance preferences persisted by `plugins/appearance.ts`. */
const APPEARANCE_KEYS = {
  dark: 'vuestrata-dark',
  theme: 'vuestrata-theme',
  locale: 'vuestrata-locale',
}

interface Appearance {
  dark?: boolean
  theme?: string
  locale?: 'en' | 'fr' | 'ar'
}

/**
 * Seed appearance BEFORE the app boots.
 *
 * `bootstrapTheme()` reads localStorage pre-mount to avoid a flash of the wrong
 * theme, so setting it after navigation would require a reload to take effect.
 */
async function applyAppearance(page: Page, appearance: Appearance) {
  await page.addInitScript(
    ({ keys, value }) => {
      // Raw strings, not JSON: appearance.ts reads these with getItem and
      // compares directly, so a JSON-quoted value fails its validation and
      // silently falls back to the default.
      if (value.dark !== undefined) localStorage.setItem(keys.dark, String(value.dark))
      if (value.theme) localStorage.setItem(keys.theme, value.theme)
      if (value.locale) localStorage.setItem(keys.locale, value.locale)
    },
    { keys: APPEARANCE_KEYS, value: appearance },
  )
}

async function gotoAndSettle(page: Page, path: string): Promise<void> {
  await page.goto(path)
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 })
  // Formwerk wires label associations in a post-mount effect; let in-flight
  // work settle before inspecting the DOM.
  await page.waitForLoadState('networkidle')

  /*
   * Wait for entrance animations to finish before auditing.
   *
   * `networkidle` says nothing about CSS animations. The home hero reveals its
   * code lines with staggered `animation-delay`s running to 1.3s, fading
   * opacity 0 → 1, so an audit that starts earlier samples half-faded text and
   * reports colour-contrast failures for colours that exist for a few hundred
   * milliseconds and are never the rendered result (e.g. #96c5b9 — primary-600
   * part-way composited onto the page). The settled colours pass.
   *
   * Only finite animations are awaited: `float`, `pulse-glow` and friends loop
   * forever, so waiting on every animation would hang.
   */
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .every((a) => a.playState === 'finished' || a.playState === 'idle'),
    null,
    { timeout: 10_000 },
  )
}

async function audit(page: Page, tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']) {
  const results = await new AxeBuilder({ page }).withTags(tags).analyze()
  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? ''),
  )

  // Assert on a readable summary — the raw violation objects carry node arrays
  // that produce hundreds of lines of unusable diff on failure.
  expect(
    blocking.map((violation) => `[${violation.impact}] ${violation.id}: ${violation.help}`),
    'Blocking accessibility violations',
  ).toEqual([])
}

test.describe('Accessibility — public pages', () => {
  for (const path of ['/', '/auth/login', '/auth/register', '/403']) {
    test(`${path} has no blocking violations`, async ({ page }) => {
      await gotoAndSettle(page, path)
      await audit(page)
    })
  }
})

test.describe('Accessibility — authenticated pages', () => {
  for (const path of [
    '/dashboard',
    '/dashboard/charts',
    '/dashboard/audit',
    '/dashboard/forms',
    '/dashboard/settings',
    // One page per interaction pattern the domain modules introduce. Auditing
    // all twenty-odd routes would mostly re-audit the same shell; these are the
    // ones whose *structure* differs, and structure is what axe can see:
    // a server-backed grid, a record page, a multi-step form, a card grid, a
    // board, a date grid, master/detail, a feed, a directory, a report table.
    '/dashboard/customers',
    '/dashboard/customers/CUS-1000',
    '/dashboard/orders/new',
    '/dashboard/products',
    '/dashboard/projects',
    '/dashboard/calendar',
    '/dashboard/messages',
    '/dashboard/notifications',
    '/dashboard/team',
    '/dashboard/reports',
    '/dashboard/account',
  ]) {
    test(`${path} has no blocking violations`, async ({ page }) => {
      await logInAsDemoAdmin(page)
      await gotoAndSettle(page, path)
      await audit(page)
    })
  }
})

/**
 * Colour-mode and theme matrix.
 *
 * Each theme installs its own ramps, and dark mode re-points the semantic
 * tokens on top of them, so a contrast pass on the default light theme says
 * nothing about the other nineteen combinations. Auditing all ten themes in
 * both modes on every page would be far too slow for CI, so this covers the
 * highest-signal combinations: the default theme in both modes, the two
 * themes whose ramps sit closest to their surfaces, the two that supply a
 * second dark-mode surface ramp, and the three saturated-fill combos
 * (Sunset light, Terminal light, Forest dark) whose primary solid plus label
 * is the contrast trap.
 */
test.describe('Accessibility — theme and colour-mode matrix', () => {
  const combinations = [
    { theme: 'default', dark: false },
    { theme: 'default', dark: true },
    // Low-contrast risk: near-black surfaces with saturated accents.
    { theme: 'terminal', dark: true },
    // Light, low-saturation ramps where muted text is most at risk.
    { theme: 'ghibli', dark: false },
    { theme: 'brutalist', dark: true },
    // The two themes that supply an entire second surface ramp for dark mode
    // rather than letting semantic.css flip the light one. Blueprint's dark
    // ramp is a Prussian-blue cyanotype whose mid steps are the only thing
    // standing between muted text and its background; Harbour lays four gradient
    // layers under translucent cards, so declared colours are not the rendered
    // ones. Neither is covered by auditing the default ramp.
    { theme: 'blueprint', dark: true },
    { theme: 'harbour', dark: false },
    // Cool near-white paper with muted steel text: the classic "elegant grey
    // on tinted white" miss. Pro's light ramp is that trap by design.
    { theme: 'pro', dark: false },
    // Saturated fills whose primary-600 + light label fails AA. These three
    // re-point `--color-primary-solid` (and Terminal's label) in their theme
    // files; leaving them out of the matrix is how the dashboard chip shipped
    // under 4.5:1.
    { theme: 'sunset', dark: false },
    { theme: 'terminal', dark: false },
    { theme: 'forest', dark: true },
  ]

  for (const { theme, dark } of combinations) {
    test(`${theme} / ${dark ? 'dark' : 'light'} — dashboard`, async ({ page }) => {
      await logInAsDemoAdmin(page)
      await applyAppearance(page, { theme, dark })
      await gotoAndSettle(page, '/dashboard')
      await audit(page)
    })
  }
})

test.describe('Accessibility — RTL', () => {
  test('Arabic locale renders right-to-left without violations', async ({ page }) => {
    await logInAsDemoAdmin(page)
    await applyAppearance(page, { locale: 'ar' })
    await gotoAndSettle(page, '/dashboard')

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await audit(page)
  })
})
