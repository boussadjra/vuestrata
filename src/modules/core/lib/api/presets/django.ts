import { anonymousForbidden, drfCsrfFailed, loginRedirect } from '../classifiers'
import { csrfPresets } from '../csrf'
import { drfErrorMapper } from '../error-mappers'
import type { ApiBackendPreset } from '../integration'

/**
 * Django REST Framework, with session authentication.
 *
 * - **403 "CSRF Failed"**: the token was missing or stale. The client reads the
 *   cookie again and replays the request once.
 * - **403 "Authentication credentials were not provided"**: DRF's answer to an
 *   anonymous request under `SessionAuthentication`. Read as an expired
 *   session, not as a missing permission.
 *
 *   What the preset goes by, in order: an error `code` in the body
 *   (`not_authenticated`), where a custom exception handler or
 *   drf-standardized-errors puts one, and otherwise that sentence. DRF
 *   translates it when `LocaleMiddleware` is active and the client sends
 *   `Accept-Language`, so the sentence is matched in English, French and
 *   Arabic, with DRF's own wording (`DRF_ANONYMOUS_MESSAGES`). In any other
 *   language a stock DRF is read as "not allowed". The fix belongs on the
 *   backend: give the first authentication class an `authenticate_header`,
 *   and DRF answers 401, which needs no classifier at all.
 * - **Redirect to the login page**: what `login_required` does on a plain
 *   Django view. Only a redirect that ended on the sign-in path is read as an
 *   expired session; one that ended on another page is an unexpected response.
 * - **Errors**: `{ detail }`, and `{ field: [...] }` with `non_field_errors`.
 * - **CSRF**: the `csrftoken` cookie as `X-CSRFToken`.
 *
 * A token-based DRF API (simplejwt, knox) answers 401 like any other and needs
 * only the error mapper.
 */
export const django: ApiBackendPreset = {
  name: 'django',
  classify: [drfCsrfFailed, anonymousForbidden(), loginRedirect()],
  errors: [drfErrorMapper],
  csrf: csrfPresets.django,
}
