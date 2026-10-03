/**
 * How `bootstrap/seams.ts` hands `auth.config.ts` to the auth adapters.
 *
 * The adapters read the project's configuration from a runtime slot in
 * `core/lib`, and `installSeams()` is what fills it: it imports the seeded
 * file, resolves it and calls `installAuthConfig()`. Nothing else reads that
 * file at runtime.
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
  'To wire it in, add three imports to bootstrap/seams.ts — ' +
  "`import authConfig from '@/config/auth.config'`, " +
  "`import { resolveAuthConfig } from '@/lib/auth/config'` and " +
  "`import { installAuthConfig } from '@/lib/runtime'` — and call " +
  '`installAuthConfig(resolveAuthConfig(authConfig))` inside installSeams(). The copy this ' +
  'release ships shows it.'
