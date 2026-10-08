import type { FormProps } from '~/types/forms'

/**
 * The props `UiForm` reads, as the code that implements it sees them.
 *
 * `~/types/forms` declares the same members on `FormProps`, and that is the
 * type a page should name. But that file was the project's until 1.1.0, and a
 * project that had edited it keeps its copy through the upgrade: a `FormProps`
 * from 1.0, with no `action` and no `confirmLeave`. `UiForm` and
 * `useUiForm` arrive regardless, and reading those members off the old type
 * would fail that project's build in files it never touched.
 *
 * So the lifecycle props are declared here, in a folder that is always
 * replaced, and intersected with whatever `FormProps` the project has. With
 * the current `types/forms.ts` the two say the same thing; with a 1.0 copy
 * this is where they come from. `test/unit/cli/held-back-1.1.0.test.ts`
 * type-checks exactly that pairing.
 *
 * A prop added to `UiForm` goes in both places.
 */
export interface UiFormLifecycleProps {
  /** Awaited on a valid submit, instead of the `submit` event. */
  action?: (values: Record<string, unknown>) => unknown
  /** After the action succeeds, put the form back to its initial values. */
  resetOnSuccess?: boolean
  /** Ask before a navigation, a reload or a closed tab discards unsaved changes. */
  confirmLeave?: boolean
  /** Where a backend field key goes when the default guess is wrong. */
  fieldMap?: Record<string, string>
  /** Replaces the default way a backend field key becomes a field path. */
  fieldPath?: (key: string) => string
  /** When a field shows what the schema says is wrong with it. */
  showErrors?: 'always' | 'touched'
}

export type UiFormProps = FormProps & UiFormLifecycleProps
