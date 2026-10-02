/**
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is yours. Vuestrata never modifies it once it has written it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * How your backend does authentication lives here instead of in
 * `src/modules/auth/adapters/`, which is Vuestrata's: edit that and it stops
 * receiving updates. Left empty, as it ships, the app speaks the contract
 * documented in `docs/6.configuration/2.auth-rbac.md`.
 *
 *   endpoints           where each request goes; `null` for one your backend
 *                       does not have, which also hides the control for it
 *   mapAuthResponse     your login response → { user, token, refreshToken?,
 *                       expiresIn? }
 *   mapRefreshResponse  the same for a refresh (defaults to mapAuthResponse)
 *   mapUser             your user record → User; the result is validated
 *   buildRefreshBody    the body of a refresh that presents a token
 *   capabilities        features the built-in adapter should not offer
 *   providers           the social sign-in buttons on the login page
 *   adapters            your own adapters, selected with VUESTRATA_AUTH_ADAPTER
 *
 * A backend that answers `{ access_token, refresh_token, expires_in }`, keeps
 * the current user at `/users/me` and has no magic links (every helper named
 * here is imported from `~/lib/auth`, like `defineAuthConfig` below):
 *
 *   export default defineAuthConfig({
 *     endpoints: { me: '/users/me', magicLink: null, magicLinkVerify: null },
 *     mapAuthResponse: authResponseMappers.snakeCase,
 *     buildRefreshBody: authRefreshBodies.snakeCase,
 *     mapUser: (raw) => {
 *       const user = raw as { id: number; email: string; full_name: string; role: string }
 *       return { id: String(user.id), email: user.email, name: user.full_name, role: user.role }
 *     },
 *   })
 *
 * An adapter of your own, loaded only by the deployment that selects it. Write
 * `adapters` inline, with plain names, and each adapter inline too: the build
 * reads the names (and each `transport`) from this file as text, without
 * running it, so that `VUESTRATA_AUTH_ADAPTER=supabase` is accepted and a name
 * nobody registered fails the build:
 *
 *   adapters: {
 *     supabase: { transport: 'bearer', load: () => import('~/auth/supabase-adapter') },
 *   },
 *
 * Declare the name as well, beside the import below, so that the type of
 * `appConfig.authProvider` includes it (the build warns when the two differ):
 *
 *   declare module '~/lib/auth' {
 *     interface RegisteredAuthAdapterNames {
 *       supabase: true
 *     }
 *   }
 *
 * `docs/9.recipes/9.write-your-own-auth-adapter.md` walks through both.
 */
import { defineAuthConfig } from '~/lib/auth'

export default defineAuthConfig({})
