import { i18n } from '@/plugins/i18n'
import apiOverrides from '~/config/api.overrides'
import { resolveApiIntegration, type ApiRequestHook } from '~/lib/api/integration'
import { installApiIntegration } from '~/lib/runtime'

/**
 * Where the project's seeded configuration files reach the runtime.
 *
 * Vuestrata's code stays replaceable by `vuestrata upgrade` only while a
 * project never has to edit it. The way a project changes behaviour instead is
 * a small file it owns — brand colours, API conventions, RBAC roles — which
 * Vuestrata's own code reads. This function is the one place those files are
 * read and handed to the framework-agnostic `core/lib` runtime slots.
 *
 * `boot()` calls it right after `installRuntimeBackends()` and before anything
 * reads an API client, a role definition or a permission, so a release adds a
 * seam here and every project picks it up without editing `main.ts`.
 *
 * The seeded files are imported statically on purpose: a deleted seam fails
 * the build instead of quietly restoring the defaults.
 *
 * Keep it synchronous. A seam that needs to load something asynchronously
 * belongs in its own boot step, where a failure reaches `renderBootFailure()`
 * like any other.
 */
export function installSeams(): void {
  installApiSeam()
}

/**
 * Tell the backend which language the user is reading.
 *
 * It is what lets a backend localize its validation messages, and it is the
 * one built-in header `core/lib` cannot produce: the active locale lives in
 * vue-i18n, which `core/lib` may not import. Read per request, so it follows a
 * language switch. `Accept-Language` is CORS-safelisted for a plain locale
 * code, so it costs no preflight. A caller that set its own is left alone.
 */
const acceptLanguage: ApiRequestHook = (request) => {
  if (request.headers.has('Accept-Language')) return
  request.setHeader('Accept-Language', i18n.global.locale.value)
}

/** `app/config/api.overrides.ts`: how the API client talks to this project's backend. */
function installApiSeam(): void {
  installApiIntegration(resolveApiIntegration(apiOverrides, { requestHooks: [acceptLanguage] }))
}
