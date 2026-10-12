import { test, expect, type ConsoleMessage } from '@playwright/test'

/**
 * The Content Security Policy, where a developer first meets it.
 *
 * `vp dev` and `vp preview` used to send no policy at all. The page's own
 * `<meta>` was the only one in force, so a request to an origin missing from
 * `connectSrc` in `deploy.config.ts` could work on every developer's machine
 * and in every preview, and be blocked in the first deployment that sends
 * headers. Both servers now send the policy the header generator produces,
 * enforced, and these tests hold them to it in a real browser.
 *
 * The production image is checked separately, against its own server
 * (`production-artifact.spec.ts`).
 */

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

test.skip(
  env.E2E_TARGET === 'external',
  'An external target sends its own headers; see production-artifact.spec.ts.',
)

/** An origin no configuration declares. `.test` never resolves. */
const UNDECLARED = 'https://undeclared.example.test'

test('the server sends the policy a deployment would send', async ({ page }) => {
  const response = await page.goto('/')
  const policy = response?.headers()['content-security-policy'] ?? ''

  expect(policy).toContain("default-src 'self'")
  expect(policy).toContain("script-src 'self'")
  // Only a header can say this: a <meta> tag cannot.
  expect(policy).toContain("frame-ancestors 'none'")
  expect(policy).toMatch(/(?:^|; )connect-src 'self'/)
  // Nothing was loosened to make the server work.
  expect(policy).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|connect-src[^;]*\*/)
})

test('the app runs under that policy without a violation', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text())
  })

  await page.goto('/')
  await expect(page.locator('#app-loader')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator('#app')).not.toBeEmpty()

  expect(
    violations,
    `The policy blocked something the app needs:\n${violations.join('\n')}`,
  ).toEqual([])
})

test('a request to an origin nobody declared is blocked and reported', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app-loader')).toHaveCount(0, { timeout: 20_000 })

  const result = await page.evaluate(async (origin) => {
    const reports: { directive: string; blocked: string; disposition: string; policy: string }[] =
      []
    document.addEventListener('securitypolicyviolation', (event) => {
      reports.push({
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        disposition: event.disposition,
        policy: event.originalPolicy,
      })
    })

    const outcome = await fetch(`${origin}/ping`).then(
      () => 'reached',
      () => 'blocked',
    )
    // The events are queued as tasks; let them run.
    await new Promise((resolve) => setTimeout(resolve, 250))
    return { outcome, reports }
  }, UNDECLARED)

  expect(result.outcome).toBe('blocked')

  const reports = result.reports.filter((report) => report.blocked.startsWith(UNDECLARED))
  expect(reports.length, JSON.stringify(result.reports)).toBeGreaterThan(0)
  for (const report of reports) {
    expect(report.directive).toBe('connect-src')
    // Enforced, not merely reported.
    expect(report.disposition).toBe('enforce')
  }
  // One of them is the HEADER's policy: only it carries frame-ancestors. The
  // page's own <meta> reports as well, and proves nothing about the server.
  expect(reports.some((report) => report.policy.includes('frame-ancestors'))).toBe(true)
})
