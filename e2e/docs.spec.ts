import { test, expect } from '@playwright/test'

/**
 * The documentation actually renders.
 *
 * Docs pages are discovered by `import.meta.glob('/docs/**​/*.md')`, so a new
 * file needs no registration — which also means a file that fails to render
 * fails silently, and nobody notices until someone follows a link.
 *
 * `scripts/docs/check-links.mjs` verifies that referenced paths exist; this
 * verifies that the pages themselves load. The two are complementary: one
 * checks what the docs point at, the other checks the docs.
 *
 * Deliberately not every page — that would cost minutes for little extra
 * signal. These are the entry points a reader actually starts from, plus the
 * pages added most recently.
 */
const PAGES = [
  '/docs',
  '/docs/getting-started/installation',
  '/docs/configuration/environment',
  '/docs/modules/creating-a-module',
  '/docs/modules/navigation',
  '/docs/deployment/vercel-demo',
  '/docs/deployment/real-production',
  '/docs/readiness',
  '/docs/troubleshooting',
]

for (const path of PAGES) {
  test(`renders ${path}`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
    // A heading proves the markdown was parsed and mounted, not merely that the
    // SPA fallback served index.html.
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15_000 })
  })
}
