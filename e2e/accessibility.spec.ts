import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'

test.describe('Accessibility audit', () => {
  test('home page should have no critical a11y violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([])
  })

  test('login page should have no critical a11y violations', async ({ page }) => {
    await page.goto('/auth/login')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

    expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([])
  })

  test('dashboard should have no critical a11y violations', async ({ page }) => {
    await page.goto('/dashboard')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

    expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([])
  })

  test('forms page should have no critical a11y violations', async ({ page }) => {
    await page.goto('/dashboard/forms')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

    expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([])
  })

  test('tables page should have no critical a11y violations', async ({ page }) => {
    await page.goto('/dashboard/tables')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()

    expect(results.violations.filter((v) => v.impact === 'critical')).toEqual([])
  })
})
