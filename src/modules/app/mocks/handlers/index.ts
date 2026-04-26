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
