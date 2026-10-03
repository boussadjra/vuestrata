import { loginRedirect } from '../classifiers'
import { csrfPresets } from '../csrf'
import { springDialect } from '../dialects'
import { problemJsonErrorMapper, springBootErrorMapper } from '../error-mappers'
import type { ApiBackendPreset } from '../integration'

/**
 * Spring Boot, with Spring Security.
 *
 * - **Redirect to `/login`**: what `formLogin()` does for an unauthenticated
 *   request. A resource server answers 401, which needs no classifier.
 * - **Errors**: RFC 9457 `ProblemDetail` when the application enables it
 *   (`spring.mvc.problemdetails.enabled`), otherwise Boot's default
 *   `{ timestamp, status, error, message, path }`, with `errors` when binding
 *   errors are included.
 * - **CSRF**: the `XSRF-TOKEN` cookie as `X-XSRF-TOKEN`, which is
 *   `CookieCsrfTokenRepository.withHttpOnlyFalse()`. Spring Security 6 also
 *   needs its single-page-application request handler configured, or it
 *   expects a masked token the cookie does not hold.
 * - **Collections**: Spring Data's `Page` (`springDialect`): `page` from 0,
 *   `size`, `sort=field,dir`, `{ content, totalElements, number, size }`. An
 *   update is still a PATCH: a collection whose controller only maps PUT says
 *   `updateMethod: 'PUT'` and passes the whole record.
 *
 * Spring answers a rejected CSRF token with a plain 403, indistinguishable
 * from a missing permission, so there is no CSRF classifier here.
 */
export const spring: ApiBackendPreset = {
  name: 'spring',
  classify: [loginRedirect()],
  errors: [problemJsonErrorMapper, springBootErrorMapper],
  csrf: csrfPresets.spring,
  collection: springDialect,
}
