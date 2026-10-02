/**
 * How `bootstrap/seams.ts` hands `auth.config.ts` to the auth module.
 *
 * The auth module cannot import the seeded file itself: that file imports its
 * helpers from the module's barrel, and a barrel that reached back to it would
 * be a cycle. So `installSeams()` reads it and calls `installAuthConfig()`.
 *
 * `seams.ts` is Vuestrata's, so a pristine project gets the wired copy from
 * the upgrade. An edited copy stays as it was, and without this call the
 * endpoints, mappers, providers and adapters the project puts in
 * `auth.config.ts` have no effect — and nothing fails to say so. `doctor`
 * warns.
 */

/** Whether `source` installs the project's auth configuration. */
export const isAuthConfigWired = (source) => /\binstallAuthConfig\s*\(/.test(source)

/** The change to an edited copy, as one paragraph for a warning. */
export const AUTH_WIRING_STEPS =
  'To wire it in, add two imports to bootstrap/seams.ts — ' +
  "`import authConfig from '@/config/auth.config'` and " +
  "`import { installAuthConfig } from '@/modules/auth'` — and call " +
  '`installAuthConfig(authConfig)` inside installSeams(). The copy this release ships shows it.'
