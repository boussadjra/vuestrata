import { loginRedirect, statusMeans } from '../classifiers'
import { csrfPresets } from '../csrf'
import { laravelErrorMapper } from '../error-mappers'
import type { ApiBackendPreset } from '../integration'

/**
 * Laravel, with Sanctum's cookie-based SPA authentication.
 *
 * - **419** is "CSRF token mismatch", which is also what an expired session
 *   looks like to a state-changing request. The client fetches a new token
 *   from `/sanctum/csrf-cookie` and replays the request once.
 * - **Redirect to `/login`**: what the `auth` middleware does for a request
 *   that does not ask for JSON. The client sends `Accept: application/json`, so
 *   Laravel normally answers 401 instead; this covers the requests that set
 *   their own `Accept`.
 * - **Errors**: `{ message, errors: { field: [...] } }`.
 * - **CSRF**: the `XSRF-TOKEN` cookie, decoded, as `X-XSRF-TOKEN`.
 *
 * The CSRF part applies under the cookie transport. A token-based Laravel API
 * (Sanctum API tokens, Passport) needs only the error mapper.
 */
export const laravel: ApiBackendPreset = {
  name: 'laravel',
  classify: [statusMeans(419, 'csrf'), loginRedirect()],
  errors: [laravelErrorMapper],
  csrf: csrfPresets.laravel,
}
