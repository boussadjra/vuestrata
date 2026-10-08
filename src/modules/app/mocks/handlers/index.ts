import { auditHandlers } from './audit'
import { billingHandlers } from './billing'
import { dashboardHandlers } from './dashboard'
import { usersHandlers } from './users'

// Auth handlers are owned by the auth module and contributed via its
// `mockHandlers` factory; they are wired into MSW after `setupModules` resolves.
export const handlers = [
  ...dashboardHandlers,
  ...usersHandlers,
  ...billingHandlers,
  ...auditHandlers,
]

/**
 * The same handlers, by the id of the module whose endpoints they answer.
 *
 * `VUESTRATA_MOCK_ONLY` lists module ids, and MSW then answers for those
 * modules alone while a real backend answers for the rest. The handlers a
 * module contributes through `mockHandlers` are found by that module's id.
 * These are not contributed by a module, so this is where each set says whose
 * it is: a set that is not listed here is never started in that mode.
 *
 * An ordinary demo does not read this. It starts every handler in `handlers`.
 */
export const handlerSets = {
  analytics: [...dashboardHandlers, ...auditHandlers],
  billing: billingHandlers,
  users: usersHandlers,
}
