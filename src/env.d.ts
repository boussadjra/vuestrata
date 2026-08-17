/// <reference types="vite-plus/client" />

/**
 * Client-exposed environment variables.
 *
 * The source of truth for validation and defaults is
 * `src/modules/app/config/env.schema.ts` (`ENV_KEYS` + `envSchema`). Keep the
 * keys below in sync with it — this file only supplies types, it validates
 * nothing.
 *
 * Every key must start with `VUESTRATA_` (see `envPrefix` in vite.config.ts).
 * That prefix REPLACES Vite's default `VITE_`, so a `VITE_*` variable is never
 * exposed to client code. Two such variables previously lived here and were
 * silently always `undefined`.
 */
interface ImportMetaEnv {
  readonly VUESTRATA_RUNTIME_MODE: 'production' | 'demo'
  readonly VUESTRATA_APP_TITLE: string
  readonly VUESTRATA_API_URL: string
  readonly VUESTRATA_USE_MOCKS: string
  readonly VUESTRATA_AUTH_ADAPTER: 'jwt' | 'oauth' | 'mock'
  readonly VUESTRATA_ICON_PROVIDER:
    | 'solar'
    | 'lucide'
    | 'phosphor'
    | 'iconoir'
    | 'tabler'
    | 'mingcute'
    | 'remix'
    | 'griddy'
    | 'iconamoon'
  readonly VUESTRATA_THEME: string
  readonly VUESTRATA_DEMO_AUTH_RETENTION_HOURS: string
  readonly VUESTRATA_ERROR_REPORTING_DSN: string
  readonly VUESTRATA_RELEASE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * Build-time constant injected by the `vuestrata:env` plugin in vite.config.ts.
 *
 * `true` for the demo build, `false` for a real production build. Because it is
 * a literal after substitution, rolldown dead-code-eliminates everything inside
 * `if (__VUESTRATA_DEMO__) { … }` out of production bundles — that is how MSW,
 * the seeded IndexedDB demo users, and the demo credentials are kept out of a
 * real deployment. Prefer this over `appConfig`, which is a runtime value and
 * therefore cannot be eliminated.
 */
declare const __VUESTRATA_DEMO__: boolean

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
