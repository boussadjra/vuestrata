/**
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is yours. Vuestrata never modifies it once it has written it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What your deployment needs that Vuestrata cannot know: environment variables
 * of your own, and the origins your security headers must allow. It is read in
 * three places — the build (which fails on an invalid variable), the browser
 * (typed as `appEnv` from `~/bootstrap/app-env`) and the header generator
 * (`vpr security:headers`) — so it holds data only. Import `zod` for the
 * schemas and nothing else by value.
 *
 * After changing `runtime` or `headers`, run `vpr security:headers` and commit
 * what it regenerates. `vpr lint` fails until you do.
 *
 *   import { z } from 'zod'
 *
 *   export default defineDeployConfig({
 *     // Your own variables. Validated at build time; a bad value fails the build.
 *     env: {
 *       VUESTRATA_SUPABASE_URL: z.url().optional(),
 *       VUESTRATA_FEATURE_BILLING: z.enum(['on', 'off']).default('off'),
 *     },
 *
 *     // The ones a deployment may set when the app starts, like the built-in
 *     // VUESTRATA_API_URL. One image then serves every environment.
 *     runtime: ['VUESTRATA_SUPABASE_URL'],
 *
 *     headers: {
 *       // Origins known when you commit. An IdP issuer, a realtime endpoint:
 *       connectSrc: ['https://login.example.com', 'wss://realtime.example.com'],
 *
 *       // Origins that differ per environment, taken from a variable's value.
 *       // An error-reporting DSN, and Supabase over https and wss:
 *       connectSrcFromEnv: ['VUESTRATA_ERROR_REPORTING_DSN', 'VUESTRATA_SUPABASE_URL'],
 *       websocketFromEnv: ['VUESTRATA_SUPABASE_URL'],
 *
 *       // Remote avatars, an embedded checkout, a font host:
 *       imgSrc: ['https://images.example.com'],
 *       frameSrc: ['https://js.stripe.com'],
 *       fontSrc: ['https://fonts.example.com'],
 *
 *       // Popup sign-in (MSAL loginPopup, Firebase signInWithPopup) needs the
 *       // opener the default `same-origin` cuts:
 *       crossOriginOpenerPolicy: 'same-origin-allow-popups',
 *     },
 *   })
 */
import { defineDeployConfig } from '~/lib/config/deploy'

export default defineDeployConfig({})
