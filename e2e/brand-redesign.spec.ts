import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const locales = [
  { code: 'en', title: 'Your app takes shape.', dir: 'ltr' },
  { code: 'fr', title: 'Votre application grandit.', dir: 'ltr' },
  { code: 'ar', title: 'طوّر تطبيقك.', dir: 'rtl' },
] as const

for (const locale of locales) {
  for (const dark of [false, true]) {
    test(`Home page redesigned ${locale.code} ${dark ? 'dark' : 'light'}`, async ({
      page,
    }, info) => {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.addInitScript(
        ({ code, dark }) => {
          localStorage.setItem('vuestrata-theme', 'default')
          localStorage.setItem('vuestrata-locale', code)
          localStorage.setItem('vuestrata-dark', String(dark))
          localStorage.setItem('vuestrata-icon-provider', dark ? 'lucide' : 'solar')
        },
        { code: locale.code, dark },
      )
      await page.goto('/')
      await expect(page.locator('#app-loader')).toBeHidden()
      await expect(page.getByRole('heading', { level: 1 })).toContainText(locale.title)
      await expect(page.locator('html')).toHaveAttribute('dir', locale.dir)
      await page.evaluate(() => document.fonts.ready)
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        width: document.documentElement.scrollWidth,
        headingFont: getComputedStyle(document.querySelector('h1')!).fontFamily,
        rootTransform: getComputedStyle(document.documentElement).transform,
      }))
      expect(layout.width).toBeLessThanOrEqual(layout.viewport + 1)
      expect(layout.headingFont).toContain('Vuestrata Commissioner')
      expect(layout.rootTransform).toBe('none')
      await expect(page.locator('.home-experience')).not.toContainText('↗')
      const ribbon = await page.locator('.hero-ribbon').evaluate((el) => {
        const style = getComputedStyle(el)
        return {
          background: style.backgroundColor,
          clip: style.clipPath,
          width: el.clientWidth,
          content: el.scrollWidth,
        }
      })
      expect(ribbon.background).not.toBe('rgba(0, 0, 0, 0)')
      expect(ribbon.clip).not.toBe('none')
      expect(ribbon.content).toBeLessThanOrEqual(ribbon.width + 1)
      const badges = await page.locator('.home-number').evaluateAll((elements) =>
        elements.map((el) => {
          const style = getComputedStyle(el)
          return {
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
            background: style.backgroundColor,
          }
        }),
      )
      expect(badges).toHaveLength(15)
      expect(
        badges.every(
          (badge) =>
            badge.width >= 20 && badge.height >= 20 && badge.background !== 'rgba(0, 0, 0, 0)',
        ),
      ).toBe(true)
      const arrow = page.locator('.hero-actions .home-arrow').first()
      await expect(arrow).toHaveClass(new RegExp(`i-${dark ? 'lucide' : 'solar'}-`))
      expect(await arrow.evaluate((el) => getComputedStyle(el).maskImage)).not.toBe('none')
      expect(await arrow.evaluate((el) => getComputedStyle(el).transform)).toBe(
        locale.dir === 'rtl' ? 'matrix(-1, 0, 0, 1, 0, 0)' : 'none',
      )
      const ownershipBounds = await page.locator('.ownership-content').boundingBox()
      expect(ownershipBounds).not.toBeNull()
      expect(ownershipBounds!.x).toBeGreaterThanOrEqual(18)
      expect(ownershipBounds!.x + ownershipBounds!.width).toBeLessThanOrEqual(layout.viewport - 18)
      await expect(page.locator('.strata-outline')).toHaveCount(0)
      const backgrounds = await page
        .locator('html, .ownership-sample')
        .evaluateAll((elements) => elements.map((el) => getComputedStyle(el).backgroundImage))
      expect(backgrounds.every((background) => background === 'none')).toBe(true)
      const canvas = await page.locator('body').evaluate((el) => {
        const style = getComputedStyle(el)
        return { image: style.backgroundImage, attachment: style.backgroundAttachment }
      })
      expect(canvas.image).toContain('linear-gradient')
      expect(canvas.image).not.toContain('radial-gradient')
      expect(canvas.attachment).toBe('scroll')
      const codeColors = await page
        .locator('.syntax-token')
        .evaluateAll((tokens) => tokens.map((token) => getComputedStyle(token).color))
      expect(new Set(codeColors).size).toBeGreaterThanOrEqual(4)
      await expect(page.locator('.foundation-preview pre')).toHaveAttribute('dir', 'ltr')
      await expect(page.locator('.foundation-preview pre script')).toHaveCount(0)
      await expect(page.locator('.workspace-table tbody tr')).toHaveCount(3)
      await expect(page.locator('.workspace-table')).toContainText('Northwind Logistics')
      const previewLayout = await page.locator('.foundation-preview').evaluate((el) => {
        const workspace = el.querySelector('.workspace-content')!
        return {
          width: el.clientWidth,
          content: el.scrollWidth,
          workspaceWidth: workspace.clientWidth,
          workspaceContent: workspace.scrollWidth,
          sourceLines: el.querySelectorAll('.code-line').length,
        }
      })
      expect(previewLayout.content).toBeLessThanOrEqual(previewLayout.width + 1)
      expect(previewLayout.workspaceContent).toBeLessThanOrEqual(previewLayout.workspaceWidth + 1)
      expect(previewLayout.sourceLines).toBeLessThanOrEqual(3)
      const logo = await page
        .getByRole('link', { name: 'Vuestrata logo', exact: true })
        .getByRole('img')
        .boundingBox()
      const language = await page.getByRole('combobox').boundingBox()
      expect(logo).not.toBeNull()
      expect(language).not.toBeNull()
      if (locale.dir === 'rtl') {
        expect(language!.x + language!.width).toBeLessThanOrEqual(logo!.x)
      } else {
        expect(logo!.x + logo!.width).toBeLessThanOrEqual(language!.x)
      }
      const wordmark = page
        .getByRole('link', { name: 'Vuestrata logo', exact: true })
        .locator('#logo-text text')
      if (await wordmark.count()) {
        const wordmarkBounds = await wordmark.evaluate((el) => {
          const bounds = (el as SVGGraphicsElement).getBBox()
          return { x: bounds.x, right: bounds.x + bounds.width }
        })
        // Allow the V's natural ink overhang while retaining a gap after the 64-unit badge.
        expect(wordmarkBounds.x).toBeGreaterThanOrEqual(72)
        expect(wordmarkBounds.right).toBeLessThanOrEqual(248)
      }
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(
        result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')),
      ).toEqual([])
      await page.screenshot({
        path: info.outputPath(`home-${locale.code}-${dark ? 'dark' : 'light'}.png`),
        fullPage: true,
      })
      if (locale.code === 'en' && !dark) {
        await page.screenshot({ path: info.outputPath('home-hero.png') })
        await page
          .locator('.workflow')
          .screenshot({ path: info.outputPath('module-walkthrough.png') })
        await page
          .locator('.ownership-section')
          .screenshot({ path: info.outputPath('ownership-layers.png') })
      }
    })
  }
}

test('Home page architecture preview and theme selection respond to keyboard input', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('vuestrata-theme')) localStorage.setItem('vuestrata-theme', 'default')
    localStorage.setItem('vuestrata-locale', 'en')
    localStorage.setItem('vuestrata-dark', 'false')
  })
  await page.goto('/')
  await expect(page.locator('#app-loader')).toBeHidden()
  const shared = page.getByRole('button', { name: '03 Shared' })
  await shared.focus()
  await shared.press('Enter')
  await expect(shared).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.source-filename')).toContainText('money.ts')
  await expect(page.locator('.foundation-preview pre')).toContainText('Math.round(amount)')
  await page.getByRole('button', { name: 'Brutalist', exact: true }).click()
  await expect(page.locator('html')).toHaveClass(/theme-brutalist/)
  expect(await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundImage)).toBe(
    'none',
  )
  expect(
    await page
      .locator('html')
      .evaluate((el) => getComputedStyle(el).getPropertyValue('--radius-md').trim()),
  ).toBe('0')
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/theme-brutalist/)
  await page.getByRole('button', { name: 'Default', exact: true }).click()
  await expect(page.locator('html')).not.toHaveClass(/theme-/)
})

test('Home page module preview and practical questions work with a keyboard', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuestrata-theme', 'default')
    localStorage.setItem('vuestrata-locale', 'en')
    localStorage.setItem('vuestrata-dark', 'false')
  })
  await page.goto('/')
  const moduleChoice = page.getByRole('button', { name: 'invoices', exact: true })
  await moduleChoice.focus()
  await moduleChoice.press('Enter')
  await expect(moduleChoice).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.terminal-window code')).toContainText('gen:module invoices --dry-run')
  await expect(page.locator('.file-root')).toContainText('src/modules/invoices/')
  await expect(page.locator('.file-list')).toContainText('composables/useInvoices.ts')
  const question = page.locator('.question-item').first()
  await question.locator('summary').focus()
  await question.locator('summary').press('Enter')
  await expect(question).toHaveAttribute('open', '')
  await expect(question.locator('p')).toBeVisible()
  await expect(question.locator('p')).toContainText('Laravel')
  await question.locator('summary').press('Enter')
  await expect(question).not.toHaveAttribute('open', '')
})

test('Home page default heading and body fonts load without external font services', async ({
  page,
}) => {
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.abort())
  await page.addInitScript(() => {
    localStorage.setItem('vuestrata-theme', 'default')
    localStorage.setItem('vuestrata-locale', 'en')
    localStorage.setItem('vuestrata-dark', 'false')
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const fonts = await page.evaluate(() => ({
    display: [...document.fonts].some(
      (font) => font.family.includes('Vuestrata Commissioner') && font.status === 'loaded',
    ),
    body: [...document.fonts].some(
      (font) => font.family.includes('Vuestrata Commissioner') && font.status === 'loaded',
    ),
  }))
  expect(fonts).toEqual({ display: true, body: true })
})
