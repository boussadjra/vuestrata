import { test, expect, type Locator, type Page } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

async function openGallery(page: Page) {
  await logInAsDemoAdmin(page)
  await page.goto('/dashboard/charts', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
  await expect(page.getByTestId('chart-gallery')).toBeVisible({ timeout: 20_000 })
}

async function expectPaintedChart(card: Locator) {
  await card.scrollIntoViewIfNeeded()
  const canvas = card.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(
      () =>
        canvas.evaluate((element) => {
          if (!(element instanceof HTMLCanvasElement)) return false
          if (element.width < 10 || element.height < 10) return false
          const context = element.getContext('2d')
          if (!context) return false
          const pixels = context.getImageData(0, 0, element.width, element.height).data
          for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index]! > 0) return true
          }
          return false
        }),
      { message: `${await card.getAttribute('data-chart-id')} must paint its canvas` },
    )
    .toBe(true)
}

test('every gallery example renders after entering the viewport', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const chartErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => chartErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
    if (/ECharts|series.*not exists|component.*not imported/i.test(message.text())) {
      if (message.type() === 'warning' || message.type() === 'error') {
        chartErrors.push(message.text())
      }
    }
  })

  await openGallery(page)
  const gallery = page.getByTestId('chart-gallery')
  const cards = gallery.getByTestId('chart-example')
  const initialIds = await cards.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-chart-id')),
  )
  expect(initialIds.length).toBeGreaterThanOrEqual(50)
  expect(new Set(initialIds).size).toBe(initialIds.length)
  expect(initialIds).not.toContain(null)

  // Off-screen examples must remain discoverable without eagerly creating fifty
  // canvases. Filtering then scrolling exercises each lazily mounted renderer.
  expect(await gallery.locator('canvas').count()).toBeLessThan(initialIds.length)
  const families = gallery.getByTestId('chart-family-filter')
  const familyIds = await families.evaluateAll((elements) =>
    elements
      .map((element) => element.getAttribute('data-chart-family'))
      .filter((family): family is string => family !== null && family !== 'all'),
  )
  expect(familyIds).toHaveLength(8)

  const renderedIds = new Set<string>()
  for (const family of familyIds) {
    // Attribute selection keeps the interaction independent of the active copy.
    const familyButton = gallery.locator(
      `[data-testid="chart-family-filter"][data-chart-family="${family}"]`,
    )
    await familyButton.click()
    await expect(familyButton).toHaveAttribute('aria-pressed', 'true')
    const count = await cards.count()
    expect(count, `${family} contains examples`).toBeGreaterThan(0)
    for (let index = 0; index < count; index++) {
      const card = cards.nth(index)
      await expect(card).toHaveAttribute('data-chart-family', family)
      await expectPaintedChart(card)
      renderedIds.add((await card.getAttribute('data-chart-id'))!)
    }
  }

  await gallery.locator('[data-chart-family="all"]').click()
  await expect(cards).toHaveCount(initialIds.length)
  expect([...renderedIds].sort((left, right) => left.localeCompare(right))).toEqual(
    [...initialIds].sort((left, right) => String(left).localeCompare(String(right))),
  )
  await testInfo.attach('gallery-console-errors', {
    body: JSON.stringify(consoleErrors, null, 2),
    contentType: 'application/json',
  })
  expect(chartErrors, 'all registered chart types must render without engine errors').toEqual([])
})

test('search, family filters and sample tables remain usable', async ({ page }) => {
  await openGallery(page)
  const gallery = page.getByTestId('chart-gallery')
  const cards = gallery.getByTestId('chart-example')
  const initialCount = await cards.count()
  const firstTitle = await cards.first().getByRole('heading').first().innerText()
  const search = gallery.getByRole('searchbox', { name: 'Find a chart', exact: true })

  await search.fill(firstTitle)
  await expect(cards.first().getByRole('heading').first()).toHaveText(firstTitle)
  expect(await cards.count()).toBeLessThan(initialCount)
  await search.fill('zzzz-no-matching-chart')
  await expect(cards).toHaveCount(0)
  await gallery
    .getByRole('button', { name: /clear filters/i })
    .first()
    .click()
  await expect(search).toHaveValue('')
  await expect(cards).toHaveCount(initialCount)
  await expect(gallery.locator('[data-chart-family="all"]')).toHaveAttribute('aria-pressed', 'true')

  const first = cards.first()
  const table = first.locator('details').getByRole('table')
  await expect(table).toBeHidden()
  const summary = first.locator('summary')
  await summary.focus()
  await summary.press('Enter')
  await expect(table).toBeVisible()
  expect(await table.locator('tbody tr').count()).toBeGreaterThan(0)
  const columnCount = await table.locator('thead th').count()
  expect(columnCount).toBeGreaterThan(1)
  for (const row of await table.locator('tbody tr').all()) {
    await expect(row.locator('th, td')).toHaveCount(columnCount)
  }
  await summary.press('Enter')
  await expect(table).toBeHidden()
})

test('the gallery and data tables fit a narrow Arabic layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openGallery(page)
  await page.addInitScript(() => localStorage.setItem('vuestrata-locale', 'ar'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  const gallery = page.getByTestId('chart-gallery')
  await expect(gallery).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')

  const first = gallery.getByTestId('chart-example').first()
  await expectPaintedChart(first)
  await expect(first.getByRole('heading').first()).toContainText(/[\u0600-\u06ff]/)
  await first.locator('summary').click()
  const table = first.locator('details').getByRole('table')
  await expect(table).toBeVisible()
  await expect(table.locator('thead')).toContainText(/[\u0600-\u06ff]/)
  expect(await gallery.innerText()).not.toMatch(/chart_gallery_|chart_example_/)

  const overflow = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1)

  // A wide sample table may scroll within its own container; it must never
  // force the page itself to scroll horizontally.
  const cardBox = await first.boundingBox()
  expect(cardBox?.x ?? -1).toBeGreaterThanOrEqual(0)
  expect((cardBox?.x ?? 0) + (cardBox?.width ?? 0)).toBeLessThanOrEqual(391)
})
