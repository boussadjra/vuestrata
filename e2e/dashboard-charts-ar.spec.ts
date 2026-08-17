import { test, expect } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

const APPEARANCE_KEYS = { locale: 'vuestrata-locale' }

test('Arabic dashboard renders ECharts canvases', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await logInAsDemoAdmin(page)

  await page.addInitScript(({ key }) => localStorage.setItem(key, 'ar'), {
    key: APPEARANCE_KEYS.locale,
  })
  await page.goto('/dashboard')
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('main').first()).toBeVisible({ timeout: 20_000 })
  await page.waitForLoadState('networkidle')

  const hosts = page.locator('.echarts-host canvas')
  await expect(hosts.first()).toBeVisible({ timeout: 15_000 })

  const canvasCount = await hosts.count()
  expect(
    canvasCount,
    `expected chart canvases, console errors: ${errors.join(' | ')}`,
  ).toBeGreaterThan(0)

  for (let i = 0; i < canvasCount; i++) {
    const box = await hosts.nth(i).boundingBox()
    expect(box?.width ?? 0, `canvas ${i} width`).toBeGreaterThan(10)
    expect(box?.height ?? 0, `canvas ${i} height`).toBeGreaterThan(10)

    const painted = await hosts.nth(i).evaluate((canvas) => {
      if (!(canvas instanceof HTMLCanvasElement)) return false
      const ctx = canvas.getContext('2d')
      if (!ctx) return false
      const { width, height } = canvas
      const sample = ctx.getImageData(0, 0, width, height).data
      for (let p = 3; p < sample.length; p += 4) {
        if (sample[p]! > 0) return true
      }
      return false
    })
    expect(painted, `canvas ${i} should contain drawn pixels`).toBe(true)
  }

  const vueChartErrors = errors.filter(
    (line) => line.includes('Echarts') || line.includes('ECharts'),
  )
  expect(vueChartErrors, 'unexpected chart errors').toEqual([])
})

test('switching to Arabic in-session keeps ECharts canvases', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))

  await logInAsDemoAdmin(page)
  await page.goto('/dashboard')
  await expect(page.locator('#app-loader')).toBeHidden({ timeout: 20_000 })
  await expect(page.locator('.echarts-host canvas').first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('combobox', { name: /language|langue|اللغة/i }).click()
  await page.getByRole('option', { name: /العربية|Arabic/i }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.waitForLoadState('networkidle')

  const hosts = page.locator('.echarts-host canvas')
  await expect(hosts.first()).toBeVisible({ timeout: 15_000 })
  const canvasCount = await hosts.count()
  expect(canvasCount).toBeGreaterThan(0)

  const vueChartErrors = errors.filter(
    (line) => line.includes('Echarts') || line.includes('ECharts'),
  )
  expect(vueChartErrors, `unexpected chart errors: ${vueChartErrors.join(' | ')}`).toEqual([])
})
