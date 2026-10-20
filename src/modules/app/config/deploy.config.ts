/**
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is yours. Vuestrata never modifies it once it has written it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What your deployment needs that Vuestrata cannot know: environment variables
 * of your own, the origins your security headers must allow, and the size
 * budgets your bundle is held to. It is read in four places — the build (which
 * fails on an invalid variable), the browser (typed as `appEnv` from
 * `~/bootstrap/app-env`), the header generator (`vpr security:headers`) and
 * the bundle check (`scripts/build/verify-bundle.mjs`) — so it holds data
 * only. Import `zod` for the schemas and nothing else by value.
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
 *
 *     // What `node scripts/build/verify-bundle.mjs` holds your build to, where
 *     // the defaults in that script do not fit your app. Sizes are in KB. Each
 *     // run prints what you set here beside the default.
 *     bundle: {
 *       initialPayloadGzipKb: 620,
 *       totalJsKb: 8192,
 *       onDemandChunks: {
 *         // A vendor group of your own that pages fetch with import():
 *         add: ['maps-vendor'],
 *         // Every page of this app has a chart, so the engine loads with it:
 *         remove: ['charts-vendor'],
 *       },
 *     },
 *   })
 */
import { defineDeployConfig } from '~/lib/config/deploy'

export default defineDeployConfig({
  bundle: {
    // The 52-example gallery adds chart families and EN/FR/AR sample catalogs.
    // Allow 7.5 MiB across all emitted JS (including lazy documentation and
    // demo chunks). Initial payload, eager chunk and CSS limits stay unchanged.
    totalJsKb: 7680,
    onDemandChunks: {
      // Feature queries load with their route, although the module registry
      // reads metadata from the same public barrels.
      add: [
        'collection-queries',
        'tables-vendor',
        'useCustomers',
        'useMessages',
        'useOrders',
        'useDashboardQueries',
      ],
    },
  },
})
