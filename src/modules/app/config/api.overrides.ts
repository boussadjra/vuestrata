/**
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is yours. Vuestrata never modifies it once it has written it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * How this app talks to YOUR backend. The API client in `core/lib/api/` is
 * Vuestrata's: edit that and it stops receiving updates. Everything a backend
 * can do differently is described here instead, and read by the client on
 * every request:
 *
 *   backend     a preset to start from: `presets.laravel`, `presets.django`,
 *               `presets.spring`, `presets.aspnet`, `presets.nest`
 *   headers     headers every request carries (a tenant, a gateway key)
 *   request     hooks that run before each request, for anything a header
 *               table cannot express. May be async
 *   classify    how your backend says "not signed in" or "stale CSRF token"
 *               when it does not say it with a JSON 401
 *   errors      how your backend formats an error body
 *   csrf        where the CSRF token is read from, and the header it returns in
 *   timeoutMs   how long a request may take (default 15000)
 *   tracing     send `X-Request-Id` and `traceparent`. Off by default: neither
 *               is CORS-safelisted, so each costs a preflight on a cross-origin
 *               API, which must also list it in `Access-Control-Allow-Headers`
 *   redirect    'error' to refuse redirects from the API instead of following
 *               them. Worth setting when `headers` holds a secret and the API
 *               never redirects: a redirect to another origin takes every
 *               header but `Authorization` with it
 *   collection  how your backend paginates, sorts and filters a list and what
 *               it wraps a record in: one of the `dialects` in
 *               `~/lib/api/dialects`, or your own. Every `createCollectionApi`
 *               call uses it unless it names another. The Laravel, Django and
 *               Spring presets bring theirs
 *
 * Left empty, as shipped, the client behaves as it always has, with two
 * additions: every request sends `Accept: application/json` (unless the caller
 * set `Accept` or asked for a non-JSON `responseType`) and `Accept-Language`
 * with the active locale.
 *
 * All of it applies to requests to your API's origin (`VUESTRATA_API_URL`) and
 * to no other. `apiFetch('https://elsewhere.example/…')` carries neither the
 * session nor anything set here, unless that call says `trusted: true`.
 *
 * ── How a preset and your options combine ──────────────────────────────────
 *
 *   headers, request   the preset's headers, then yours, then the preset's
 *                      hooks, then yours: later ones win
 *   classify, errors   yours first, then the preset's, then the built-ins:
 *                      the first to answer wins
 *   csrf, timeoutMs,   yours replaces the preset's
 *   tracing, redirect,
 *   collection
 *
 * ── Examples ───────────────────────────────────────────────────────────────
 *
 * A Laravel backend with Sanctum's cookie sessions:
 *
 *   import { presets } from '~/lib/api/presets'
 *
 *   export default defineApiOverrides({ backend: presets.laravel })
 *
 * A tenant header read from a store. The function runs per request, so it
 * sees the tenant selected now; returning nothing sends no header, and a call
 * that passes its own `X-Tenant` keeps it:
 *
 *   import { useTenantStore } from '@/stores/tenant'
 *
 *   export default defineApiOverrides({
 *     headers: {
 *       'X-Tenant': () => useTenantStore().currentTenantId,
 *     },
 *   })
 *
 * ASP.NET Core problem details, with correlation ids switched on:
 *
 *   import { errorMappers } from '~/lib/api/error-mappers'
 *
 *   export default defineApiOverrides({
 *     errors: [errorMappers.problemJson],
 *     tracing: { requestId: true },
 *   })
 *
 * A status your backend uses for an expired session:
 *
 *   import { statusMeans } from '~/lib/api/classifiers'
 *
 *   export default defineApiOverrides({
 *     classify: [statusMeans(440, 'unauthenticated')],
 *   })
 *
 * A Laravel backend whose JSON is snake_case, read and written as camelCase:
 *
 *   import { dialects, extendDialect } from '~/lib/api/dialects'
 *   import { presets } from '~/lib/api/presets'
 *
 *   export default defineApiOverrides({
 *     backend: presets.laravel,
 *     collection: extendDialect(dialects.laravel, { keys: 'camel' }),
 *   })
 *
 * The full recipe is docs/9.recipes/9.connect-your-backend-api.md.
 */
import { defineApiOverrides } from '~/lib/api/integration'

export default defineApiOverrides({})
