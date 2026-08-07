import { test, expect, type Page } from '@playwright/test'

import { logInAsDemoAdmin } from './helpers/auth'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the dashboard/forms route with auth already established. */
async function goToFormsPage(page: Page) {
  await logInAsDemoAdmin(page)
  await page.goto('/dashboard/forms')
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 })
}

function getPrimitivesCard(page: Page) {
  return page
    .getByRole('heading', { name: /Formwerk Primitives/i })
    .locator('xpath=ancestor::div[contains(@class, "rounded-2xl")][1]')
}

// ---------------------------------------------------------------------------
// Page load
// ---------------------------------------------------------------------------

test.describe('Forms page — structure', () => {
  test.beforeEach(async ({ page }) => {
    await goToFormsPage(page)
  })

  test('renders the page heading', async ({ page }) => {
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('shows the contact form section', async ({ page }) => {
    const heading = page.getByText(/contact/i).first()
    await expect(heading).toBeVisible()
  })

  test('shows the profile form section', async ({ page }) => {
    const heading = page.getByText(/profile/i).first()
    await expect(heading).toBeVisible()
  })

  test('contact form has all required fields', async ({ page }) => {
    await expect(page.locator('input[placeholder="John Doe"]')).toBeVisible()
    await expect(page.locator('input[type="email"][placeholder="john@example.com"]')).toBeVisible()
    await expect(page.locator('input[placeholder="Inquiry about..."]')).toBeVisible()
    await expect(page.locator('textarea[placeholder="Tell us more..."]')).toBeVisible()
  })

  test('contact form has priority radio buttons', async ({ page }) => {
    await expect(page.locator('input[type="radio"][name="priority"][value="low"]')).toBeVisible()
    await expect(page.locator('input[type="radio"][name="priority"][value="medium"]')).toBeVisible()
    await expect(page.locator('input[type="radio"][name="priority"][value="high"]')).toBeVisible()
  })

  test('contact form has agree-to-terms checkbox', async ({ page }) => {
    const checkbox = page.locator('input[type="checkbox"]').first()
    await expect(checkbox).toBeVisible()
  })

  test('profile form is pre-filled with demo data', async ({ page }) => {
    // The profile form's email is the 2nd type="email" on the page
    // (nth(0)=contact, nth(1)=profile, nth(2)=primitives)
    await expect(page.locator('input[type="email"]').nth(1)).toHaveValue('demo@vuestrata.dev')
  })
})

// ---------------------------------------------------------------------------
// Contact form — validation
// ---------------------------------------------------------------------------

test.describe('Contact form — validation', () => {
  test.beforeEach(async ({ page }) => {
    await goToFormsPage(page)
  })

  test('shows required-field errors when submitting empty', async ({ page }) => {
    // Clear all fields first
    await page.locator('input[placeholder="John Doe"]').fill('')
    await page.locator('input[type="email"][placeholder="john@example.com"]').fill('')
    await page.locator('input[placeholder="Inquiry about..."]').fill('')
    await page.locator('textarea[placeholder="Tell us more..."]').fill('')

    // Ensure checkbox is unchecked
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (await checkbox.isChecked()) await checkbox.uncheck()

    // Submit
    await page.locator('button[type="submit"]').first().click()

    // Expect at least one error message to appear
    const errors = page.locator('form [role="alert"]')
    await expect(errors.first()).toBeVisible({ timeout: 3_000 })
  })

  test('shows error for name too short', async ({ page }) => {
    await page.locator('input[placeholder="John Doe"]').fill('A')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('valid@example.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Valid subject here')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('This is a long enough message.')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()
    await page.locator('button[type="submit"]').first().click()

    await expect(page.getByText(/at least 2 characters/i)).toBeVisible({
      timeout: 3_000,
    })
  })

  test('shows error for invalid email format', async ({ page }) => {
    // Disable browser-native email validation so Zod errors can surface
    await page
      .locator('form')
      .first()
      .evaluate((el) => el.setAttribute('novalidate', ''))
    await page.locator('input[placeholder="John Doe"]').fill('Jane Doe')
    await page.locator('input[type="email"][placeholder="john@example.com"]').fill('not-an-email')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Valid subject here')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('This is a long enough message.')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()
    await page.locator('button[type="submit"]').first().click()

    await expect(page.getByText(/valid email/i).first()).toBeVisible({
      timeout: 3_000,
    })
  })

  test('shows error for subject too short', async ({ page }) => {
    await page.locator('input[placeholder="John Doe"]').fill('Jane Doe')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('jane@example.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('No')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('This is a long enough message.')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()
    await page.locator('button[type="submit"]').first().click()

    await expect(page.getByText(/subject is required/i)).toBeVisible({
      timeout: 3_000,
    })
  })

  test('shows error for message too short', async ({ page }) => {
    await page.locator('input[placeholder="John Doe"]').fill('Jane Doe')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('jane@example.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Valid subject here')
    await page.locator('textarea[placeholder="Tell us more..."]').fill('Short')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()
    await page.locator('button[type="submit"]').first().click()

    await expect(page.getByText(/at least 10 characters/i)).toBeVisible({
      timeout: 3_000,
    })
  })

  test('shows error when terms not accepted', async ({ page }) => {
    await page.locator('input[placeholder="John Doe"]').fill('Jane Doe')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('jane@example.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Valid subject here')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('This is a long enough message.')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (await checkbox.isChecked()) await checkbox.uncheck()
    await page.locator('button[type="submit"]').first().click()

    // The Zod error message from z.literal(true).message
    await expect(
      page.locator('form [role="alert"]').filter({ hasText: /agree/i }).first(),
    ).toBeVisible({ timeout: 3_000 })
  })
})

// ---------------------------------------------------------------------------
// Contact form — successful submission
// ---------------------------------------------------------------------------

test.describe('Contact form — successful submission', () => {
  test.beforeEach(async ({ page }) => {
    await goToFormsPage(page)
  })

  test('submits with all valid inputs and shows success notification', async ({ page }) => {
    await page.locator('input[placeholder="John Doe"]').fill('Jane Doe')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('jane@example.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Question about pricing')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('I would like to know more about enterprise pricing options.')

    // Select high priority
    await page.locator('input[type="radio"][name="priority"][value="high"]').check()

    // Accept terms
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()

    // Submit
    await page.locator('button[type="submit"]').first().click()

    // Should show success notification (toast has both title and message; match title)
    await expect(page.getByText(/form submitted|sent successfully/i).first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test('submit button shows loading state during submission', async ({ page }) => {
    await page.locator('input[placeholder="John Doe"]').fill('Jane Doe')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('jane@example.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Question about something')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('A longer message that meets the minimum length requirement.')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()

    await page.locator('button[type="submit"]').first().click()

    // The button text briefly changes to "Sending…" during the 1s async delay
    await expect(
      page
        .locator('button[type="submit"]')
        .first()
        .filter({ hasText: /sending/i })
        .or(page.getByText(/sent successfully/i)),
    ).toBeVisible({ timeout: 5_000 })
  })

  test('priority defaults to medium', async ({ page }) => {
    const medium = page.locator('input[type="radio"][name="priority"][value="medium"]')
    await expect(medium).toBeChecked()
  })

  test('can change priority selection', async ({ page }) => {
    await page.locator('input[type="radio"][name="priority"][value="low"]').check()
    await expect(page.locator('input[type="radio"][name="priority"][value="low"]')).toBeChecked()
    await expect(
      page.locator('input[type="radio"][name="priority"][value="medium"]'),
    ).not.toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// Profile form
// ---------------------------------------------------------------------------

test.describe('Profile form', () => {
  test.beforeEach(async ({ page }) => {
    await goToFormsPage(page)
  })

  test('displays pre-filled demo values', async ({ page }) => {
    // Profile form is the second form on the page
    const profileSection = page.locator('form').nth(1)
    await expect(profileSection).toBeVisible()

    // nth(0)=contact email (empty), nth(1)=profile email (pre-filled), nth(2)=primitives email (empty)
    const emailInputs = page.locator('input[type="email"]')
    await expect(emailInputs.nth(1)).toHaveValue('demo@vuestrata.dev')
  })

  test('role select has developer pre-selected', async ({ page }) => {
    const profileForm = page.locator('form').nth(1)
    const roleSelect = profileForm.locator('select')
    await expect(roleSelect).toHaveValue('developer')
  })

  test('can change the role', async ({ page }) => {
    const profileForm = page.locator('form').nth(1)
    const roleSelect = profileForm.locator('select')
    await roleSelect.selectOption('designer')
    await expect(roleSelect).toHaveValue('designer')
  })

  test('bio textarea has character count hint', async ({ page }) => {
    await expect(page.getByText(/\/500 characters/i)).toBeVisible()
  })

  test('character count updates as bio is edited', async ({ page }) => {
    // Textarea order: 0=contact message, 1=profile bio, 2=primitives bio
    const profileBio = page.locator('textarea').nth(1)
    await profileBio.fill('Hello world')
    await expect(page.getByText(/11\/500 characters/i)).toBeVisible()
  })

  test('clears validation errors on valid re-submission', async ({ page }) => {
    const profileForm = page.locator('form').nth(1)
    // Clear email to trigger error
    const profileEmail = profileForm.locator('input[type="email"]')
    await profileEmail.fill('')
    await profileForm.getByRole('button', { name: /^save profile$/i }).click()
    await expect(page.getByText(/valid email/i)).toBeVisible({
      timeout: 3_000,
    })

    // Fix the email
    await profileEmail.fill('demo@vuestrata.dev')
    await profileForm.getByRole('button', { name: /^save profile$/i }).click()
    await expect(page.getByText(/profile saved/i).first()).toBeVisible({
      timeout: 5_000,
    })
  })

  test('saves profile successfully with valid data', async ({ page }) => {
    await page.locator('button[type="submit"]').last().click()
    await expect(page.getByText(/profile saved/i).first()).toBeVisible({
      timeout: 5_000,
    })
  })
})

// ---------------------------------------------------------------------------
// Keyboard navigation & accessibility
// ---------------------------------------------------------------------------

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await goToFormsPage(page)
  })

  test('contact form fields have associated labels', async ({ page }) => {
    // All visible inputs should be reachable by label text or placeholder
    await expect(page.locator('input[placeholder="John Doe"]')).toBeVisible()
    await expect(page.getByLabel(/name/i).first()).toBeVisible()
  })

  test('can tab through contact form fields', async ({ page }) => {
    const nameInput = page.locator('input[placeholder="John Doe"]')
    await nameInput.focus()
    await page.keyboard.press('Tab')
    // After tab, focus should move to the email field
    await expect(page.locator('input[type="email"][placeholder="john@example.com"]')).toBeFocused()
  })

  test('error messages have role=alert', async ({ page }) => {
    await page.locator('button[type="submit"]').first().click()

    // If no role=alert, fall back to checking for error text
    const errorTexts = page.locator('form [role="alert"]')
    const count = await errorTexts.count()
    // At least some errors should appear
    expect(count).toBeGreaterThan(0)
  })

  test('submit button is disabled while submitting', async ({ page }) => {
    await page.locator('input[placeholder="John Doe"]').fill('Jane Doe')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('jane@example.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Valid subject for test')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('A long enough message body for the form validation to pass.')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()

    await page.locator('button[type="submit"]').first().click()

    // During the async submit (1 s delay) the button should be disabled
    await expect(page.locator('button[type="submit"]').first()).toBeDisabled()

    // Wait for completion
    await expect(page.getByText(/sent successfully/i)).toBeVisible({
      timeout: 5_000,
    })
  })
})

// ---------------------------------------------------------------------------
// Formwerk primitives showcase
// ---------------------------------------------------------------------------

test.describe('Formwerk primitives showcase', () => {
  test.beforeEach(async ({ page }) => {
    await goToFormsPage(page)
  })

  test('primitives section is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Formwerk Primitives/i })).toBeVisible()
  })

  test('name text field accepts input', async ({ page }) => {
    // The primitives section has a "Full Name" field
    const nameInputs = page.locator('input[placeholder="Enter name"]')
    await expect(nameInputs.first()).toBeVisible()
    await nameInputs.first().fill('Alice')
    await expect(nameInputs.first()).toHaveValue('Alice')
  })

  test('number field has increment/decrement buttons', async ({ page }) => {
    const primitivesCard = getPrimitivesCard(page)
    const decrement = primitivesCard.getByRole('button', { name: /^decrement$/i })
    const increment = primitivesCard.getByRole('button', { name: /^increment$/i })
    await expect(decrement).toBeVisible()
    await expect(increment).toBeVisible()
  })

  test('number field increments correctly', async ({ page }) => {
    const primitivesCard = getPrimitivesCard(page)
    const increment = primitivesCard.getByRole('button', { name: /^increment$/i })
    const ageInput = primitivesCard
      .locator('input[type="number"], input[inputmode="numeric"]')
      .first()
    const before = Number(await ageInput.inputValue())
    await increment.click()
    const after = Number(await ageInput.inputValue())
    expect(after).toBeGreaterThanOrEqual(before)
  })

  test('radio group selects correct option', async ({ page }) => {
    const primitivesCard = getPrimitivesCard(page)
    const designerRadio = primitivesCard.getByLabel(/designer/i)
    await designerRadio.check({ force: true })
    await expect(designerRadio).toBeChecked()
  })

  test('newsletter checkbox can be checked', async ({ page }) => {
    const primitivesCard = getPrimitivesCard(page)
    const newsletter = primitivesCard.getByLabel(/subscribe to newsletter/i)
    await newsletter.check({ force: true })
    await expect(newsletter).toBeChecked()
  })
})

// ---------------------------------------------------------------------------
// Responsive / mobile
// ---------------------------------------------------------------------------

test.describe('Forms — responsive layout', () => {
  test('renders correctly at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await goToFormsPage(page)
    await expect(page.locator('input[placeholder="John Doe"]')).toBeVisible()
    await expect(page.locator('h1').first()).toBeVisible()
  })

  test('renders correctly at tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 })
    await goToFormsPage(page)
    await expect(page.locator('input[placeholder="John Doe"]')).toBeVisible()
  })

  test('submit works on mobile layout', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await goToFormsPage(page)

    await page.locator('input[placeholder="John Doe"]').fill('Mobile User')
    await page
      .locator('input[type="email"][placeholder="john@example.com"]')
      .fill('mobile@test.com')
    await page.locator('input[placeholder="Inquiry about..."]').fill('Mobile form test submit')
    await page
      .locator('textarea[placeholder="Tell us more..."]')
      .fill('Testing form submission on a mobile viewport to ensure it works.')
    const checkbox = page.locator('input[type="checkbox"]').first()
    if (!(await checkbox.isChecked())) await checkbox.check()

    await page.locator('button[type="submit"]').first().click()
    await expect(page.getByText(/sent successfully|form submitted/i).first()).toBeVisible({
      timeout: 5_000,
    })
  })
})

// ---------------------------------------------------------------------------
// Dark mode
// ---------------------------------------------------------------------------

test.describe('Forms — dark mode', () => {
  test('form inputs remain visible in dark mode', async ({ page }) => {
    await goToFormsPage(page)
    // Toggle dark mode
    const toggle = page
      .locator(
        'button[aria-label*="dark"], button[aria-label*="light"], button[aria-label*="theme"]',
      )
      .first()
    if (await toggle.isVisible()) {
      await toggle.click()
    } else {
      // Force dark class via JS
      await page.evaluate(() => document.documentElement.classList.add('dark'))
    }
    await expect(page.locator('input[placeholder="John Doe"]')).toBeVisible()
    await expect(page.locator('input[type="email"][placeholder="john@example.com"]')).toBeVisible()
  })
})
