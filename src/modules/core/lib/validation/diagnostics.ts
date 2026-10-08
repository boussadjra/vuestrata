import type { z } from 'zod'
import en from 'zod/v4/locales/en.js'

/**
 * Parse something a developer will read about, not a user.
 *
 * `zod-error-map.ts` installs the app's `validation.*` catalog for every
 * schema (`z.config({ customError })` is global), which is right for a form
 * and wrong for everything else zod checks: a response that broke its
 * contract, a user the backend sent, a deployment's configuration. Those
 * issues go to the console, devtools and the error reporter, and
 * "id: Please enter a valid value", or the same in Arabic, tells the person
 * reading the report nothing that "id: Invalid input: expected string,
 * received number" does not.
 *
 * A per-parse `error` outranks the global one (and a message a schema sets
 * for itself outranks both), so parsing through here yields zod's own English
 * whatever is installed and whatever language the app is showing.
 *
 * Every parse of a response or of configuration in `core/lib` goes through
 * this, and `test/unit/lib/zod-diagnostics.test.ts` fails on one that does
 * not. Two files cannot import it: `config/env.schema.ts` and
 * `config/deploy.ts` are loaded by Node before any alias exists and may
 * depend on nothing but zod. They pass the same `IN_ZODS_OWN_WORDS` built from
 * the same locale, each from its own copy, and the same test holds them to it.
 */

/** The parse options that make an issue read as zod wrote it, in English. */
export const IN_ZODS_OWN_WORDS = { error: en().localeError } as const

/** `schema.safeParse(value)`, with every issue in zod's own English. */
export function safeParseForDiagnostics<S extends z.ZodType>(
  schema: S,
  value: unknown,
): z.ZodSafeParseResult<z.output<S>> {
  return schema.safeParse(value, IN_ZODS_OWN_WORDS)
}
