/**
 * How `bootstrap/seams.ts` hands `api.overrides.ts` to core/lib.
 *
 * The file is Vuestrata's, so a pristine project gets the wired copy from the
 * upgrade. An edited copy stays as it was, and without this change what the
 * project sets in `api.overrides.ts` (a preset, headers, error mappers, a CSRF
 * strategy) has no effect — and nothing fails to say so: the API client falls
 * back to its defaults. `doctor` warns, and names the change.
 */

/**
 * `source` without its comments, so that code which was commented out is not
 * mistaken for code that runs. Strings and template literals are kept whole: a
 * `//` inside `'https://…'` starts no comment.
 *
 * With `strings: false` the contents of string literals are dropped as well,
 * leaving the quotes: what remains is code, and text that merely mentions a
 * call is not one.
 *
 * Not a parser. It does not know a regular expression literal from a division,
 * and drops the code inside a template literal's `${}` along with its text,
 * which is enough for a file of imports and calls.
 */
export function stripComments(source, { strings = true } = {}) {
  let out = ''
  let quote = null
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1]

    if (quote) {
      if (char === '\\') {
        index++
        if (strings) out += char + (source[index] ?? '')
      } else if (char === quote) {
        quote = null
        out += char
      } else if (strings) {
        out += char
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      out += char
      continue
    }
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      if (end === -1) break
      index = end - 1
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      if (end === -1) break
      index = end + 1
      // A block comment separates tokens, as a space does.
      out += ' '
      continue
    }
    out += char
  }
  return out
}

/**
 * Whether `source` installs the project's API overrides. A call that is
 * commented out, or quoted in a string, installs nothing, which is exactly the
 * state `doctor` exists to report.
 */
export const isApiWired = (source) =>
  /\binstallApiIntegration\s*\(/.test(stripComments(source, { strings: false }))

/** The change to an edited copy, as one paragraph for a note or a warning. */
export const API_WIRING_STEPS =
  'To wire it in, add one line to installSeams() in bootstrap/seams.ts: ' +
  '`installApiIntegration(resolveApiIntegration(apiOverrides, { requestHooks: [acceptLanguage] }))` ' +
  "(with `import apiOverrides from '~/config/api.overrides'`, " +
  "`import { resolveApiIntegration } from '~/lib/api/integration'` and " +
  "`import { installApiIntegration } from '~/lib/runtime'`). `acceptLanguage` is the hook that " +
  'sends the active locale; leave the `requestHooks` option out to send none. The copy this ' +
  'release ships shows all of it.'
