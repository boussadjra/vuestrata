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
 *   session, not as a missing permission. DRF translates that sentence when a
 *   locale is active; see `anonymousForbidden` for matching a translated or
 *   coded response.
 * - **Redirect to a login page**: what `login_required` does on a plain Django
 *   view.
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
