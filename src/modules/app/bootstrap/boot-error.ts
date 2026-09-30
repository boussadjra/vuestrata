import { reportError } from '@/lib/errors'
import { logger } from '@/lib/logger'

/**
 * What the visitor gets when a step of `boot()` throws.
 *
 * Deliberately minimal for now: the error is logged and reported, nothing more.
 * `boot()` runs before there is an app to render into, so the eventual screen
 * (a static alert that also removes the `#app-loader` splash) cannot use Vue,
 * i18n or a `Ui*` component. It replaces this function without changing the
 * signature, which is why `boot()` reaches it through its dependencies.
 *
 * Must never throw: it is the last line of defence for a failed boot, and an
 * exception here would surface as an unhandled rejection with nothing shown.
 */
export function renderBootFailure(err: unknown): void {
  logger.error('Bootstrap failed:', { err })
  try {
    reportError(err, { source: 'bootstrap' })
  } catch {
    // `reportError` already swallows reporter failures; this only guards a
    // reporter that throws while being resolved.
  }
}
