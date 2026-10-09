import { FormKey } from '@formwerk/core'

/**
 * The value a field falls back on when the developer handed it none.
 *
 * One rule decides which value a field inside a form opens on, and the field
 * is the only place that can apply it, because only the field knows whether
 * the developer passed a value:
 *
 *   1. a model value was passed (`v-model` or `model-value`, an explicit `''`,
 *      `[]`, `false` or `0` included): that value wins, and `v-model` stays in
 *      step with the form;
 *   2. none was passed and the form holds a value for the field: the form's
 *      value is shown. An edit form opens on the record;
 *   3. none was passed and the form holds nothing, `undefined` or `null`: the
 *      field's own empty value applies. A `null` is never kept by a field that
 *      has one.
 *
 * Formwerk lets a field's value beat the form's, and a wrapper that hands it
 * `props.modelValue ?? ''` has made its own default indistinguishable from a
 * value the developer chose: the select of an edit form opened blank over a
 * record that had a status. So a default goes to Formwerk marked as one.
 *
 * The mark is Formwerk's own. Its switch gives `false` this way (`lowPriority`
 * in `@formwerk/core`), and a marked value is resolved exactly as rules 2 and
 * 3 read: the form's current value, else its initial value, else the default.
 * Formwerk does not export the helper, so the shape is repeated here, in the
 * one file that would have to change with it. `ui-form-field-matrix.test.ts`
 * runs every field type against the installed Formwerk and fails on the first
 * field that opens on the marker instead of a value.
 *
 * Outside a form, or without a name, there is nothing to yield to and Formwerk
 * would store the marker itself: the default is handed over as it is, and a
 * standalone field behaves as it always did.
 */
export function useOwnDefault(props: { name?: string }) {
  const yieldsToForm = inject(FormKey, null) !== null && Boolean(props.name)

  return function ownDefault<T>(value: T): T {
    if (!yieldsToForm) return value
    return { __isFwLowPriority__: true, value } as unknown as T
  }
}
