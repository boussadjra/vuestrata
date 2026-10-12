import { expect, type Page } from '@playwright/test'

/** Open the drawer before interacting with sidebar links on a small screen. */
export async function openSidebar(page: Page): Promise<void> {
  const toggle = page.getByTestId('mobile-sidebar-toggle')
  if (await toggle.isVisible()) {
    const sidebar = page.getByRole('navigation', { name: /sidebar/i })
    if ((await sidebar.getAttribute('aria-modal')) !== 'true') await toggle.click()
    await expect(sidebar).toHaveAttribute('aria-modal', 'true')
  }
}
