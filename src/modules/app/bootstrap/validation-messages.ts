import { intlLocale } from '@/plugins/appearance'
import { getI18n } from '@/plugins/i18n'
import { installZodErrorMap } from '~/lib/validation/zod-error-map'

/**
 * Make zod describe what is wrong with a value in the language the user reads.
 *
 * `core/lib/validation/zod-error-map.ts` knows which `validation.*` key answers
 * which zod issue, but not how to translate one: `core/lib` may not import
 * vue-i18n. This binds it to the app's i18n instance and installs it for every
 * schema, so a form's schema needs no message of its own to be readable in
 * French or Arabic.
 *
 * The translate function reads the active locale on every call, so nothing has
 * to be reinstalled when the language changes: the next validation is in the
 * new language.
 *
 * A boot step of its own, after `installI18n()`. Returns the function that
 * removes the map again, which only tests have a use for.
 */
export function installValidationMessages(): () => void {
  const { global } = getI18n()
  const translate = global.t as (
    key: string,
    named: Record<string, string | number>,
    plural?: number,
  ) => string

  return installZodErrorMap(
    (key, named = {}, plural) =>
      plural === undefined ? translate(key, named) : translate(key, named, plural),
    {
      formatDate: (date) =>
        new Intl.DateTimeFormat(intlLocale(global.locale.value), { dateStyle: 'medium' }).format(
          date,
        ),
    },
  )
}
