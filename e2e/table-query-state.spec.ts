import { expect, test } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

test('customer list links survive reload, paging and browser history', async ({ page }) => {
  await logInAsDemoAdmin(page)
  await page.goto('/dashboard/customers?page=2&utm_source=reference#customers')
  await expect(page.locator('tbody tr')).toHaveCount(10)
  await expect(page.getByText(/Showing 11-20 of/)).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Showing 11-20 of/)).toBeVisible()

  const search = page.getByRole('searchbox')
  await search.fill('Northwind')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await expect(page.getByText('Showing 1-3 of 3 rows')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('search')).toBe('Northwind')
  expect(new URL(page.url()).searchParams.has('page')).toBe(false)
  expect(new URL(page.url()).searchParams.get('utm_source')).toBe('reference')
  expect(new URL(page.url()).hash).toBe('#customers')

  await search.fill('')
  await expect(page.locator('tbody tr')).toHaveCount(10)
  await page.getByRole('button', { name: /^next$/i }).click()
  await expect(page.getByText(/Showing 11-20 of/)).toBeVisible()
  await page.goBack()
  await expect(page.getByText(/Showing 1-10 of/)).toBeVisible()
  await page.goForward()
  await expect(page.getByText(/Showing 11-20 of/)).toBeVisible()
})

test('sort and domain filters update one coherent customer request', async ({ page }) => {
  await logInAsDemoAdmin(page)
  await page.goto('/dashboard/customers?page=2')
  await expect(page.getByText(/Showing 11-20 of/)).toBeVisible()
  const requests: URL[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.resourceType() === 'fetch' && url.pathname.endsWith('/customers'))
      requests.push(url)
  })
  await page.getByRole('button', { name: /^Company$/i }).click()
  await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Company')
  await expect(page.getByText(/Showing 1-10 of/)).toBeVisible()
  await expect.poll(() => requests.length).toBe(1)
  expect(requests[0]?.searchParams.get('page')).toBe('1')
  expect(requests[0]?.searchParams.get('sortBy')).toBe('company')

  await page.getByRole('combobox', { name: /filter by status/i }).click()
  await page.getByRole('option', { name: /^Active$/ }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('status')).toBe('active')
  await expect(page.locator('tbody tr').first()).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(6)
})

test('invalid list parameters recover and order links remain functional', async ({ page }) => {
  await logInAsDemoAdmin(page)
  await page.goto('/dashboard/orders?page=-3&pageSize=999&sortBy=password&status=unknown')
  await expect(page.locator('tbody tr')).toHaveCount(10)
  await expect(page.getByText(/Showing 1-10 of/)).toBeVisible()
  await page.getByRole('button', { name: /^Placed$/i }).click()
  await expect.poll(() => new URL(page.url()).searchParams.get('sortBy')).toBe('placedAt')
  await page.locator('tbody a').first().click()
  await expect(page).toHaveURL(/\/dashboard\/orders\/ORD-/)
})

test('mobile Arabic retains shareable state and confines horizontal table scrolling', async ({
  page,
}) => {
  await logInAsDemoAdmin(page)
  await page.addInitScript(() => {
    localStorage.setItem('vuestrata-locale', 'ar')
    localStorage.setItem('vuestrata-theme', 'blueprint')
    localStorage.setItem('vuestrata-dark', 'true')
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard/customers?search=Northwind')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await expect(page.getByRole('searchbox')).toHaveValue('Northwind')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.reload()
  await expect(page.getByRole('searchbox')).toHaveValue('Northwind')
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: '.scratch/table-blueprint-dark-ar-mobile.png', fullPage: true })
})

test('built login and dashboard defer the table engine until the first customer list', async ({
  page,
}) => {
  const scripts: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname)
  })
  const isTableEngine = (path: string) => /(?:^|\/)tables-vendor[-.][^/]+\.js$/.test(path)

  await page.goto('/auth/login')
  await expect(page.locator('#email')).toBeVisible()
  const entry = await page.locator('script[type="module"][src]').first().getAttribute('src')
  test.skip(
    !entry || !/\/assets\/[^/]+\.js$/.test(entry),
    'Chunk boundaries are checked against a built preview, not the development server.',
  )
  expect(
    scripts.filter(isTableEngine),
    'The login page must not download the table engine.',
  ).toEqual([])

  await logInAsDemoAdmin(page)
  expect(
    scripts.filter(isTableEngine),
    'The dashboard must not download the table engine.',
  ).toEqual([])

  await page.goto('/dashboard/customers')
  await expect(page.locator('tbody tr')).toHaveCount(10)
  await expect.poll(() => scripts.some(isTableEngine)).toBe(true)
  await expect(page.getByRole('table', { name: 'Customers', exact: true })).toBeVisible()
})

test.describe('native customer table theme and colour-mode matrix', () => {
  const themes = [
    'default',
    'brutalist',
    'ghibli',
    'ocean',
    'sunset',
    'forest',
    'rose',
    'terminal',
    'blueprint',
    'harbour',
    'pro',
    'analog',
  ]

  for (const theme of themes) {
    for (const dark of [false, true]) {
      test(`${theme} / ${dark ? 'dark' : 'light'} keeps the customer table usable`, async ({
        page,
      }) => {
        await page.addInitScript(
          (appearance) => {
            localStorage.setItem('vuestrata-theme', appearance.theme)
            localStorage.setItem('vuestrata-dark', String(appearance.dark))
            localStorage.setItem('vuestrata-locale', 'en')
          },
          { theme, dark },
        )
        await page.setViewportSize({ width: 1280, height: 800 })
        await logInAsDemoAdmin(page)
        await page.goto('/dashboard/customers')
        const table = page.getByRole('table', { name: 'Customers', exact: true })
        await expect(table.locator('tbody tr')).toHaveCount(10)
        await page.evaluate(() => document.fonts.ready)
        expect(await page.locator('html').evaluate((html) => html.classList.contains('dark'))).toBe(
          dark,
        )
        expect(
          await page
            .locator('html')
            .evaluate((html, name) => html.classList.contains(`theme-${name}`), theme),
        ).toBe(theme !== 'default')
        await expect(table.locator('thead th')).toHaveCount(6)
        await expect(table).toHaveAttribute('aria-colcount', '6')
        await expect(table.locator('tbody a').first()).toHaveAttribute(
          'href',
          /\/dashboard\/customers\//,
        )

        const sort = table.getByRole('button', { name: 'Company', exact: true })
        await sort.focus()
        await expect(sort).toBeFocused()
        await sort.press('Enter')
        await expect(table.locator('th[aria-sort="ascending"]')).toContainText('Company')
        await expect.poll(() => new URL(page.url()).searchParams.get('sortBy')).toBe('company')
        await expect(table.locator('tbody tr')).toHaveCount(10)

        const scroll = await page.locator('[data-ui="data-grid-body"]').evaluate((element) => ({
          overflow: getComputedStyle(element).overflowX,
          viewport: element.clientWidth,
          content: element.scrollWidth,
          document: document.documentElement.scrollWidth,
          window: innerWidth,
        }))
        expect(scroll.overflow).toBe('auto')
        expect(scroll.document).toBeLessThanOrEqual(scroll.window + 1)
        if (theme === 'terminal' && dark) {
          await expect(
            table
              .locator('[data-ui="badge"]')
              .filter({ hasText: /^Prospect$/ })
              .first(),
          ).toBeVisible()
          await expect(
            page
              .locator('[data-ui="data-grid"] [data-ui="badge"]')
              .filter({ hasText: /^\d+ total$/ }),
          ).toBeVisible()
          const contrasts = await page
            .locator('[data-ui="data-grid"] [data-ui="badge"]')
            .filter({ hasText: /^(?:Prospect|\d+ total)$/ })
            .evaluateAll((badges) => {
              const canvas = document.createElement('canvas')
              canvas.width = canvas.height = 1
              const context = canvas.getContext('2d')!
              function rgba(color: string): number[] {
                context.clearRect(0, 0, 1, 1)
                context.fillStyle = color
                context.fillRect(0, 0, 1, 1)
                return [...context.getImageData(0, 0, 1, 1).data]
              }
              function overlay(foreground: number[], background: number[]): number[] {
                const alpha = foreground[3]! / 255
                return foreground
                  .slice(0, 3)
                  .map((channel, index) => channel * alpha + background[index]! * (1 - alpha))
                  .concat(255)
              }
              function luminance(color: number[]): number {
                const linear = color.slice(0, 3).map((channel) => {
                  const value = channel / 255
                  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
                })
                return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722
              }
              return badges.map((badge) => {
                const ancestors: Element[] = []
                for (let element: Element | null = badge; element; element = element.parentElement)
                  ancestors.unshift(element)
                const background = ancestors.reduce(
                  (color, element) =>
                    overlay(rgba(getComputedStyle(element).backgroundColor), color),
                  [255, 255, 255, 255],
                )
                const foreground = overlay(rgba(getComputedStyle(badge).color), background)
                const light = luminance(foreground)
                const dark = luminance(background)
                return {
                  text: badge.textContent?.trim() ?? '',
                  ratio: (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
                }
              })
            })
          expect(contrasts.length).toBeGreaterThanOrEqual(2)
          expect(contrasts.some((badge) => badge.text === 'Prospect')).toBe(true)
          expect(contrasts.some((badge) => badge.text.endsWith('total'))).toBe(true)
          for (const badge of contrasts)
            expect(
              badge.ratio,
              `${badge.text} must meet normal-text contrast`,
            ).toBeGreaterThanOrEqual(4.5)
        }
        if ((theme === 'default' && !dark) || (theme === 'terminal' && dark)) {
          await page.screenshot({
            path: `.scratch/table-${theme}-${dark ? 'dark' : 'light'}-desktop.png`,
            fullPage: true,
          })
        }

        // At desktop width every column may fit. A narrow viewport must keep
        // genuinely overflowing columns inside the table's own scroll region.
        await page.setViewportSize({ width: 390, height: 844 })
        // The shell animates its desktop sidebar margin during the breakpoint
        // change. Measure the settled mobile layout rather than that transition.
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
          .toBe(true)
        const narrow = await page.locator('[data-ui="data-grid-body"]').evaluate((element) => {
          element.scrollLeft = element.scrollWidth
          return {
            viewport: element.clientWidth,
            content: element.scrollWidth,
            offset: element.scrollLeft,
            document: document.documentElement.scrollWidth,
            window: innerWidth,
          }
        })
        expect(narrow.content).toBeGreaterThan(narrow.viewport)
        expect(narrow.offset).toBeGreaterThan(0)
        expect(narrow.document).toBeLessThanOrEqual(narrow.window + 1)
      })
    }
  }
})
