/**
 * The line to show a user for a failed request, in the language they are
 * reading.
 *
 * `describeError` in `core/lib/errors` decides what that line is: the
 * backend's own message for a request it refused, else the translation of the
 * error's `messageKey`, else its English fallback. It takes a translate
 * function because `core/lib` may not import vue-i18n. This binds it to the
 * one the app uses.
 *
 *     const { errorMessage } = useErrorMessage()
 *
 *     <UiAlert v-if="saveError" variant="error">{{ errorMessage(saveError) }}</UiAlert>
 *
 * Rendering `error.message` directly is the thing to avoid: it is English for
 * every user, and for an error nothing classified it is whatever was thrown.
 *
 * Call it in `setup()`, like `useI18n()`. `errorMessage()` reads the active
 * locale, so a template or a `computed` that calls it follows a language
 * switch.
 */
import { useI18n } from 'vue-i18n'

import { describeError } from '~/lib/errors'

export function useErrorMessage() {
  const { t } = useI18n()

  /** The message for `error`, or an empty string when there is no error. */
  function errorMessage(error: unknown): string {
    if (error === null || error === undefined) return ''
    return describeError(error, (key) => t(key))
  }

  return { errorMessage }
}
