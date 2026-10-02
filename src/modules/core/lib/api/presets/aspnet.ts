import { loginRedirect } from '../classifiers'
import { problemJsonErrorMapper } from '../error-mappers'
import type { ApiBackendPreset } from '../integration'

/**
 * ASP.NET Core.
 *
 * - **Redirect to `/Account/Login`**: what cookie authentication does for an
 *   unauthenticated request unless the application overrides
 *   `OnRedirectToLogin`. JWT bearer authentication answers 401, which needs no
 *   classifier.
 * - **Errors**: `ProblemDetails` and `ValidationProblemDetails`
 *   (`errors: { "Email": ["…"] }`), with `traceId` as the request id. Field
 *   names arrive as the server spells them, usually PascalCase.
 *
 * No CSRF strategy: antiforgery in ASP.NET Core has no single convention for a
 * single-page app. If yours sets a readable cookie, describe it under `csrf`.
 */
export const aspnet: ApiBackendPreset = {
  name: 'aspnet',
  classify: [loginRedirect()],
  errors: [problemJsonErrorMapper],
}
