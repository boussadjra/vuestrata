/**
 * How `bootstrap/seams.ts` hands `api.overrides.ts` to core/lib.
 *
 * The file is Vuestrata's, so a pristine project gets the wired copy from the
 * upgrade. An edited copy stays as it was, and without this change what the
 * project sets in `api.overrides.ts` (a preset, headers, error mappers, a CSRF
 * strategy) has no effect — and nothing fails to say so: the API client falls
 * back to its defaults. `doctor` warns, and names the change.
 */

/** Whether `source` installs the project's API overrides. */
export const isApiWired = (source) => /\binstallApiIntegration\s*\(/.test(source)

/** The change to an edited copy, as one paragraph for a note or a warning. */
export const API_WIRING_STEPS =
  'To wire it in, add one line to installSeams() in bootstrap/seams.ts: ' +
  '`installApiIntegration(resolveApiIntegration(apiOverrides, { requestHooks: [acceptLanguage] }))` ' +
  "(with `import apiOverrides from '~/config/api.overrides'`, " +
  "`import { resolveApiIntegration } from '~/lib/api/integration'` and " +
  "`import { installApiIntegration } from '~/lib/runtime'`). `acceptLanguage` is the hook that " +
  'sends the active locale; leave the `requestHooks` option out to send none. The copy this ' +
  'release ships shows all of it.'
