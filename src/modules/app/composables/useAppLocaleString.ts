import { useI18n } from 'vue-i18n'

/**
 * Read a shell-catalog string outside a component's own `t()` scope.
 *
 * ## Why this no longer imports the JSON
 *
 * It used to do this:
 *
 * ```ts
 * import en from '@/locales/en.json'
 * return String(catalog[key] ?? catalogs.en[key] ?? key)
 * ```
 *
 * `vite.config.ts` lists `src/modules/app/locales/**` in the
 * `@intlify/unplugin-vue-i18n` `include` array, which means those JSON files
 * are **precompiled into message AST objects** at build time. Importing one
 * therefore yields objects, not strings, so `String(...)` produced the literal
 * text `"[object Object]"` — which is what the Forms showcase rendered for its
 * docs link, and what made the navigation e2e test unable to find a link named
 * "Form docs and examples".
 *
 * (Oxlint had been flagging it the whole time as
 * `typescript(no-base-to-string)`. It was a real bug, not a false positive.)
 *
 * The original justification was that keys added after the dev server started
 * resolve to the key string until a restart. That is handled properly by the
 * HMR hooks in `plugins/i18n.ts`, which `mergeLocaleMessage` the updated
 * catalog onto the live i18n instance — so going through `t()` is both correct
 * and no more stale.
 */

/**
 * Keys of the shell catalog.
 *
 * A `typeof import(...)` type query rather than a value import: it is erased at
 * compile time, so no catalog is pulled into this module's bundle — which is
 * the whole problem above — while callers keep compile-time key checking.
 */
export type AppLocaleKey = keyof typeof import('@/locales/en.json')

export function useAppLocaleString(key: AppLocaleKey) {
  // Kept as one object rather than destructured: `t`/`te` are methods, and
  // pulling them off the instance detaches them from `this` (unbound-method).
  const i18n = useI18n()

  // `te` first — vue-i18n returns the KEY itself when a message is missing, so
  // a bare `t()` would silently render `forms_docs_title` to the user.
  return computed(() => (i18n.te(key) ? i18n.t(key) : key))
}
