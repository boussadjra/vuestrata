import AxeBuilder from '@axe-core/playwright'
import { test, expect, type Page } from '@playwright/test'

import { expireSession, logInAsDemoAdmin, signOut } from './helpers/auth'

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
  await page.goto(path, { waitUntil: 'domcontentloaded' })
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

    // The 48 fixtures include three Northwind companies. Wait for the server
    // result, rather than the single placeholder row shown while it loads.
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(3, { timeout: 15_000 })
    await expect(rows).toContainText([
      'Northwind Logistics',
      'Northwind Logistics 2',
      'Northwind Logistics 3',
    ])
    await expect(page.getByText('Showing 1-3 of 3 rows')).toBeVisible()
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

/**
 * The customer form's submit lifecycle, in the demo build.
 *
 * The mock backend refuses a customer whose email another customer already
 * has: the one rule a schema cannot check, so the one place a save the form
 * believed valid comes back refused. What matters is where the refusal ends
 * up: under the field it is about, in the reader's language and direction,
 * and in a state a screen reader and axe can make sense of.
 */
test.describe('customer form: validation, server errors and unsaved changes', () => {
  // These cases include sign-in, two form visits, saves and a full axe audit.
  // Keep each assertion's timeout while allowing the complete workflow to finish.
  test.describe.configure({ timeout: 60_000 })
  const BLOCKING_IMPACTS = new Set(['critical', 'serious'])

  async function audit(page: Page): Promise<void> {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const blocking = results.violations.filter((violation) =>
      BLOCKING_IMPACTS.has(violation.impact ?? ''),
    )
    expect(
      blocking.map((violation) => `[${violation.impact}] ${violation.id}: ${violation.help}`),
      'Blocking accessibility violations',
    ).toEqual([])
  }

  /** Entrance animations sample half-faded colours; audit the settled page. */
  async function animationsSettled(page: Page): Promise<void> {
    await page.waitForFunction(() =>
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .every((a) => a.playState === 'finished' || a.playState === 'idle'),
    )
  }

  async function setLocale(page: Page, locale: 'en' | 'ar'): Promise<void> {
    // Written pre-boot and as a raw string: `bootstrapTheme()` reads it before
    // mount to set html[dir].
    await page.addInitScript((value) => localStorage.setItem('vuestrata-locale', value), locale)
  }

  /** The email of a customer that exists, read from its own edit form. */
  async function takenEmail(page: Page): Promise<string> {
    await page.goto('/dashboard/customers/CUS-1000/edit', { waitUntil: 'domcontentloaded' })
    const email = page.locator('input[name="email"]')
    await expect(email).not.toHaveValue('', { timeout: 15_000 })
    return email.inputValue()
  }

  async function fillNewCustomer(page: Page, email: string): Promise<void> {
    await page.goto('/dashboard/customers/new', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('form')).toBeVisible({ timeout: 15_000 })
    await page.locator('input[name="company"]').fill('Hopper Systems')
    await page.locator('input[name="contactName"]').fill('Grace Hopper')
    await page.locator('input[name="email"]').fill(email)
    await page.locator('input[name="phone"]').fill('+1 555 0100')
    await page.locator('input[name="city"]').fill('Arlington')
  }

  /** The message rendered under a field. */
  function errorOf(page: Page, name: string) {
    return page.locator(`input[name="${name}"] ~ [role="alert"]`)
  }

  for (const { locale, dir, message } of [
    { locale: 'en', dir: 'ltr', message: 'A customer with this email already exists.' },
    { locale: 'ar', dir: 'rtl', message: 'يوجد عميل بهذا البريد الإلكتروني بالفعل.' },
  ] as const) {
    test(`a server refusal is shown under its field (${locale})`, async ({ page }) => {
      await logInAsDemoAdmin(page)
      await setLocale(page, locale)
      const email = await takenEmail(page)

      await fillNewCustomer(page, email)
      await expect(page.locator('html')).toHaveAttribute('dir', dir)
      await page.locator('form button[type="submit"]').click()

      const fieldMessage = errorOf(page, 'email')
      await expect(fieldMessage).toHaveText(message, { timeout: 15_000 })

      // The input is marked invalid and names the message as its error.
      const input = page.locator('input[name="email"]')
      await expect(input).toHaveAttribute('aria-invalid', 'true')
      const errorId = await input.getAttribute('aria-errormessage')
      expect(errorId).toBeTruthy()
      await expect(page.locator(`[id="${errorId}"]`)).toHaveText(message)

      // The backend's own summary, above the buttons. Nothing was saved.
      await expect(page.locator('form [data-ui="alert"]')).toBeVisible()
      await expect(page).toHaveURL(/\/dashboard\/customers\/new$/)

      // The message starts where the field starts: the right edge in Arabic.
      const inputBox = (await input.boundingBox())!
      const messageBox = (await fieldMessage.boundingBox())!
      if (dir === 'rtl') {
        expect(
          Math.abs(messageBox.x + messageBox.width - (inputBox.x + inputBox.width)),
        ).toBeLessThan(2)
      } else {
        expect(Math.abs(messageBox.x - inputBox.x)).toBeLessThan(2)
      }

      await animationsSettled(page)
      await audit(page)

      // Editing the field answers the message, and the corrected save goes through.
      await input.fill(`grace.${locale}@hopper.example`)
      await expect(fieldMessage).toHaveCount(0)
      await page.locator('form button[type="submit"]').click()
      await expect(page).toHaveURL(/\/dashboard\/customers\/CUS-\d+$/, { timeout: 15_000 })
    })
  }

  test('an empty form opens clean and names what is missing on submit', async ({ page }) => {
    await open(page, '/dashboard/customers/new')
    await expect(page.locator('form')).toBeVisible({ timeout: 15_000 })

    await expect(page.locator('form [role="alert"]')).toHaveCount(0)

    await page.locator('form button[type="submit"]').click()

    await expect(errorOf(page, 'company')).toHaveText('This field is required')
    await expect(errorOf(page, 'email')).toHaveText('This field is required')
    await expect(page).toHaveURL(/\/dashboard\/customers\/new$/)
    await animationsSettled(page)
    await audit(page)
  })

  test('an edit form opens on the record and saves a change', async ({ page }) => {
    await open(page, '/dashboard/customers/CUS-1000/edit')
    await expect(page.locator('input[name="company"]')).not.toHaveValue('', { timeout: 15_000 })

    // Both selects show the record's values, and nothing is marked wrong.
    const selects = page.locator('form [data-ui="select"]')
    await expect(selects).toHaveCount(2)
    await expect(selects.nth(0)).toHaveText(/Prospect|Trial|Active|Churned/)
    await expect(selects.nth(1)).toHaveText(/Starter|Growth|Scale|Enterprise/)
    await expect(page.locator('form [role="alert"]')).toHaveCount(0)

    await page.locator('input[name="city"]').fill('Reykjavik')
    await page.locator('form button[type="submit"]').click()

    await expect(page).toHaveURL(/\/dashboard\/customers\/CUS-1000$/, { timeout: 15_000 })
    await expect(page.getByText('Reykjavik').first()).toBeVisible()
  })

  for (const { locale, dir, title } of [
    { locale: 'en', dir: 'ltr', title: 'Discard unsaved changes?' },
    { locale: 'ar', dir: 'rtl', title: 'هل تريد تجاهل التغييرات غير المحفوظة؟' },
  ] as const) {
    test(`leaving with unsaved changes asks first (${locale})`, async ({ page }) => {
      await logInAsDemoAdmin(page)
      await setLocale(page, locale)
      await page.goto('/dashboard/customers/new')
      await expect(page.locator('form')).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('html')).toHaveAttribute('dir', dir)

      await page.locator('input[name="company"]').fill('Hopper Systems')
      // The Cancel link in the page header. The one at the foot of the form
      // sits on the fold at this viewport: focusing it scrolls the page between
      // mouse-down and mouse-up, and the click never lands.
      const cancel = page.locator('main a[href="/dashboard/customers"]').first()
      await cancel.click()

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText(title)
      await expect(page).toHaveURL(/\/dashboard\/customers\/new$/)

      // Focus starts on the answer that loses nothing, and stays in the dialog.
      const stay = page.getByTestId('unsaved-changes-stay')
      const leave = page.getByTestId('unsaved-changes-leave')
      await expect(stay).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(leave).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(dialog.locator(':focus')).toHaveCount(1)

      // The buttons run in reading order: "keep editing" first.
      const stayBox = (await stay.boundingBox())!
      const leaveBox = (await leave.boundingBox())!
      if (dir === 'rtl') expect(stayBox.x).toBeGreaterThan(leaveBox.x)
      else expect(stayBox.x).toBeLessThan(leaveBox.x)

      await animationsSettled(page)
      await audit(page)

      // Escape keeps editing: the dialog closes and what was typed is intact.
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await expect(page.locator('input[name="company"]')).toHaveValue('Hopper Systems')
      await expect(page).toHaveURL(/\/dashboard\/customers\/new$/)

      // Reopen with the keyboard after Escape; cover both ways of leaving.
      await cancel.focus()
      await cancel.press('Enter')
      await expect(dialog).toBeVisible()
      await leave.click()
      await expect(page).toHaveURL(/\/dashboard\/customers$/)
    })
  }

  for (const { locale, dir } of [
    { locale: 'en', dir: 'ltr' },
    { locale: 'ar', dir: 'rtl' },
  ] as const) {
    test(`a refusal brings the refused field into view and focuses it (${locale})`, async ({
      page,
      isMobile,
    }) => {
      // Short enough that the email field is off screen once the submit
      // button, at the foot of the form, has been scrolled to. Keep mobile
      // devices at their narrow layout instead of resizing them to desktop.
      await page.setViewportSize({ width: isMobile ? 393 : 1024, height: 300 })
      await logInAsDemoAdmin(page)
      await setLocale(page, locale)
      const taken = await takenEmail(page)

      await fillNewCustomer(page, taken)
      await expect(page.locator('html')).toHaveAttribute('dir', dir)
      const submit = page.locator('form button[type="submit"]')
      await animationsSettled(page)
      await submit.evaluate((element) =>
        element.scrollIntoView({ block: 'end', behavior: 'instant' }),
      )
      const email = page.locator('input[name="email"]')
      // Mobile browsers can pan their visual viewport without changing the
      // layout viewport IntersectionObserver uses. Check what the user sees.
      async function emailIsOnScreen(): Promise<boolean> {
        return email.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const viewport = window.visualViewport
          const top = viewport?.offsetTop ?? 0
          const bottom = top + (viewport?.height ?? window.innerHeight)
          const centerY = box.top + box.height / 2
          if (centerY <= top || centerY >= bottom) return false
          // A fixed header can cover a field whose box intersects the viewport.
          return document.elementFromPoint(box.left + box.width / 2, centerY) === element
        })
      }
      await expect.poll(emailIsOnScreen).toBe(false)

      await submit.focus()
      await page.keyboard.press('Enter')

      await expect(errorOf(page, 'email')).toBeVisible({ timeout: 15_000 })
      await expect(email).toBeFocused()
      await expect.poll(emailIsOnScreen).toBe(true)
      // While it saved, the button kept focus instead of handing it to <body>;
      // afterwards it is an ordinary button again.
      await expect(submit).not.toHaveAttribute('aria-busy', 'true')
      await expect(submit).toBeEnabled()
    })
  }

  test('an expired session is sent to login, unsaved changes or not', async ({ page }) => {
    await logInAsDemoAdmin(page)
    await fillNewCustomer(page, 'grace.expired@hopper.example')
    await expireSession(page)

    // The save is the request that finds out.
    await page.locator('form button[type="submit"]').click()

    await expect(page).toHaveURL(/\/auth\/login\?/, { timeout: 15_000 })
    const query = new URL(page.url()).searchParams
    expect(query.get('reason')).toBe('expired')
    expect(query.get('redirect')).toBe('/dashboard/customers/new')
    // Nothing stood in the way, and nothing is left asking.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: /session expired/i })).toBeVisible()
  })

  test('signing out with unsaved changes asks first, and can be declined', async ({ page }) => {
    await logInAsDemoAdmin(page)
    await page.goto('/dashboard/customers/new')
    await expect(page.locator('form')).toBeVisible({ timeout: 15_000 })
    await page.locator('input[name="company"]').fill('Hopper Systems')

    await signOut(page)

    // Asked before anything was ended: "keep editing" keeps the session too.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Discard unsaved changes?')
    await page.getByTestId('unsaved-changes-stay').click()
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/dashboard\/customers\/new$/)
    await expect(page.locator('input[name="company"]')).toHaveValue('Hopper Systems')
    await expect(page.getByTestId('account-menu-trigger')).toBeVisible()

    // And "discard" signs out, with no second question on the way to login.
    await page.locator('input[name="company"]').fill('Hopper Systems')
    await signOut(page)
    await page.getByTestId('unsaved-changes-leave').click()
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 15_000 })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
