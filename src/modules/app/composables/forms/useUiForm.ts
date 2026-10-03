import { FormKey, useForm } from '@formwerk/core'

import { useErrorMessage } from '@/composables/useErrorMessage'
import { normalizeError, reportError, type AppError } from '~/lib/errors'
import { logger } from '~/lib/logger'
import type { FormProps } from '~/types/forms'

import { toDotPath, useServerErrors } from './useServerErrors'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

/**
 * Everything `UiForm` does, and the only place besides the field composables
 * that talks to Formwerk's form API. Formwerk is pre-1.0: when its API moves,
 * this file and its neighbours move with it and no page has to.
 *
 * What it adds to Formwerk's `useForm`:
 *
 *   - **an awaited submit.** With an `action`, a valid submit awaits it, so
 *     `isSubmitting` covers the save and a second submit is ignored until the
 *     first has finished. Formwerk's own `handleSubmit` leaves `isSubmitting`
 *     true for ever when its handler throws, so the action is never allowed to.
 *   - **the server's verdict on the fields.** A rejected action is shown on the
 *     form (see `useServerErrors`) and handed to the `error` event. A refused
 *     request is an answer, not a crash, so a 4xx is not reported; anything
 *     else is, once.
 *   - **a baseline that follows the save.** After a successful action the form
 *     is clean: the saved values are the new starting point, or with
 *     `resetOnSuccess` the old one is restored.
 *   - **the unsaved-changes guard**, for `confirmLeave`.
 *
 * A form with no `action` emits `submit` exactly as it always did.
 */

type FormValues = Record<string, unknown>

/** `UiForm`'s emit. Declared here so the composable can be handed it. */
export interface UiFormEmit {
  (event: 'submit', values: FormValues): void
  (event: 'success', result: unknown, values: FormValues): void
  (event: 'error', error: AppError, values: FormValues): void
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === null || prototype === Object.prototype
}

/** Every value of a nested object, by dot path. An array is one value. */
function leavesOf(values: FormValues, prefix = ''): Array<[path: string, value: unknown]> {
  return Object.entries(values).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return isPlainObject(value) ? leavesOf(value, path) : [[path, value] as [string, unknown]]
  })
}

function isSameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime()
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, at) => isSameValue(item, right[at]))
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    return [...keys].every((key) => isSameValue(left[key], right[key]))
  }
  return false
}

/** The paths at which two snapshots of the form's values differ. */
function changedPaths(current: unknown, baseline: unknown, prefix = ''): string[] {
  if (isPlainObject(current) && isPlainObject(baseline)) {
    const keys = new Set([...Object.keys(current), ...Object.keys(baseline)])
    return [...keys].flatMap((key) =>
      changedPaths(current[key], baseline[key], prefix ? `${prefix}.${key}` : key),
    )
  }
  if (Array.isArray(current) && Array.isArray(baseline) && current.length === baseline.length) {
    return current.flatMap((item, at) => changedPaths(item, baseline[at], `${prefix}.${at}`))
  }
  return prefix && !isSameValue(current, baseline) ? [prefix] : []
}

/**
 * A field may be named `lines[0].sku` or `lines.0.sku`; Formwerk reads both as
 * the same place. The server's messages are kept under the dotted spelling.
 */
function dotted(path: string): string {
  return path.includes('[') ? toDotPath(path) : path
}

/** What a field holds before anyone has chosen anything: `''`, or no items. */
function isEmptyDefault(value: unknown): boolean {
  return value === '' || (Array.isArray(value) && value.length === 0)
}

/**
 * A request the server refused, or one the app cancelled itself: an outcome
 * the form shows or ignores, and nobody has to fix. Everything else (a 5xx,
 * a response that broke its contract, a bug in the action) is a defect.
 */
function isExpectedFailure(error: AppError): boolean {
  if (error.kind === 'aborted') return true
  if (error.kind !== undefined && error.kind !== 'http') return false
  return error.status >= 400 && error.status < 500
}

/**
 * The localized line for an error. `UiForm` is mounted in places that never
 * installed vue-i18n (a bare component test, an embed); there the error's own
 * English message is still better than no form.
 */
function resolveErrorMessage(): (error: unknown) => string {
  try {
    return useErrorMessage().errorMessage
  } catch {
    return (error) => normalizeError(error).message
  }
}

export function useUiForm(props: FormProps, emit: UiFormEmit) {
  const formLogger = logger.withTag('form')

  const formOptions = props.schema
    ? {
        schema: props.schema,
        initialValues: props.initialValues,
        disabled: props.disabled,
        disableHtmlValidation: props.disableHtmlValidation,
      }
    : {
        initialValues: props.initialValues,
        disabled: props.disabled,
        disableHtmlValidation: props.disableHtmlValidation,
      }

  const form = useForm(formOptions as Parameters<typeof useForm>[0])
  const { values, handleSubmit, isSubmitting, wasSubmitted, isSubmitAttempted, context } = form

  // Wrapped rather than destructured: they are methods of the form object.
  const isDirty: typeof form.isDirty = (path) => form.isDirty(path)
  const isTouched: typeof form.isTouched = (path) => form.isTouched(path)
  const isValid: typeof form.isValid = (path) => form.isValid(path)

  // ─── Which paths have a field ────────────────────────────
  //
  // A server message for a path nothing renders would be invisible, so the
  // form has to know its fields. Formwerk's fields announce themselves through
  // the context's `transaction()` when they mount, move and unmount; counting
  // those is the registry. Counted rather than set, because a field that
  // replaces another at the same path announces itself before the old one
  // leaves, and one that is gone within a tick leaves before it has arrived.
  const fieldCounts = new Map<string, number>()

  function countField(path: string, change: 1 | -1): void {
    const key = dotted(path)
    const next = (fieldCounts.get(key) ?? 0) + change
    if (next === 0) fieldCounts.delete(key)
    else fieldCounts.set(key, next)
  }

  const hasField = (path: string) => (fieldCounts.get(dotted(path)) ?? 0) > 0

  const transaction: typeof context.transaction = (run) => {
    context.transaction((inner, kinds) => {
      const commit = run(inner, kinds)
      if (!commit || typeof commit.path !== 'string') return commit

      if (commit.kind === kinds.DESTROY_PATH || commit.kind === kinds.UNSET_PATH) {
        countField(commit.path, -1)
      } else if (commit.kind === kinds.SET_PATH) {
        countField(commit.path, 1)
      } else if (commit.kind === kinds.INIT_PATH) {
        countField(commit.path, 1)
        // A field that starts out empty by default (a select is `''` until
        // something is chosen) hands Formwerk that default as its own initial
        // value, and Formwerk lets a field's value beat the form's. The select
        // of an edit form then opened blank, over a record that had a status.
        // The form's initial value is the one the page asked for.
        if (
          isEmptyDefault(commit.value) &&
          context.getFieldInitialValue(commit.path) !== undefined
        ) {
          return { ...commit, value: undefined }
        }
      }
      return commit
    })
  }

  // ─── What the server said ────────────────────────────────

  const errorMessage = resolveErrorMessage()
  const submitError = shallowRef<AppError | null>(null)
  /** The one-line summary is all the form shows beyond its fields' messages. */
  const summaryOnly = shallowRef(false)

  const server = useServerErrors(() => ({
    fieldMap: props.fieldMap,
    fieldPath: props.fieldPath,
    hasField,
  }))

  /**
   * What the form says as a whole: the server's form-level messages, or
   * failing those the one line that describes the failure, so a failed submit
   * is never silent. Computed, so it follows a language switch.
   */
  const formErrors = computed<string[]>(() => {
    if (server.formErrors.value.length > 0) return server.formErrors.value
    return submitError.value ? [errorMessage(submitError.value)] : []
  })

  function clearErrors(): void {
    server.clear()
    submitError.value = null
    summaryOnly.value = false
  }

  function setErrors(errors: Readonly<Record<string, string | string[]>>): void {
    submitError.value = null
    summaryOnly.value = false
    server.set(errors)
  }

  // ─── The context the fields see ──────────────────────────
  //
  // Formwerk keeps one `errors` state and replaces all of it on every
  // validation, which in a schema form is every keystroke: a server message
  // written there is gone as soon as the user types anywhere. So the server's
  // messages live here, and the fields are handed a context whose
  // `getErrors()` adds them. Formwerk's own state is never touched, which is
  // why a server message does not stop the form being submitted again.

  /** Whether the schema's verdict on a path is shown yet. */
  function isRevealed(path?: string): boolean {
    if (props.showErrors !== 'touched') return true
    if (isSubmitAttempted.value) return true
    return path ? context.isBlurred(path) : false
  }

  const getErrors = ((path?: string) => {
    const own: string[] = context.getErrors(path)
    const shown = isRevealed(path) ? own : []
    const fromServer = server.errorsFor(path === undefined ? path : dotted(path))
    return fromServer.length > 0 ? [...fromServer, ...shown] : shown
  }) as typeof context.getErrors

  /** A field the user edits has answered what the server said about it. */
  const setValue = ((path: string, value: unknown) => {
    context.setValue(path, value)
    const key = dotted(path)
    if (server.errorsFor(key).length === 0) return
    server.clear(key)
    if (summaryOnly.value && server.errorsFor().length === 0) clearErrors()
  }) as typeof context.setValue

  // After `useForm()`, so this is the context the fields below inject.
  provide(FormKey, { ...context, transaction, getErrors, setValue } as typeof context)

  // ─── Baseline ────────────────────────────────────────────

  /**
   * Make `saved` the values the form is compared against. A field edited while
   * the save was in flight differs from what was saved, and stays dirty.
   */
  function rebaseline(saved: FormValues): void {
    context.setInitialValues(saved)
    context.revertDirty()
    for (const path of changedPaths(context.getValues(), saved)) context.setDirty(path, true)
  }

  /**
   * Back to the initial values, or to `next`, which then becomes the baseline.
   * Clears the server's messages and what was touched.
   */
  async function reset(next?: FormValues): Promise<void> {
    clearErrors()
    if (next === undefined) await form.reset()
    else await form.reset({ value: next })
  }

  /**
   * Set some of the form's values, by name or nested the way the form holds
   * them. The baseline is untouched, so the form becomes dirty where a value
   * differs from it. An array is set whole.
   */
  function setValues(next: FormValues): void {
    for (const [path, value] of leavesOf(next)) context.setValue(path, value)
  }

  // ─── Submit ──────────────────────────────────────────────

  function fail(thrown: unknown, output: FormValues): void {
    const error = normalizeError(thrown)

    // The app cancelled the request itself: nothing failed, nothing to show.
    if (error.kind !== 'aborted') {
      const mapping = server.apply(error)
      submitError.value = error
      summaryOnly.value = mapping.form.length === 0 && Object.keys(mapping.fields).length > 0
    }

    if (!isExpectedFailure(error)) {
      formLogger.error('Form action failed:', error.message, {
        code: error.code,
        status: error.status,
      })
      reportError(thrown, {
        source: 'form:action',
        extra: { code: error.code, status: error.status },
      })
    }

    emit('error', error, output)
  }

  const submitValid = handleSubmit(async (data) => {
    const output = data.toObject() as FormValues
    const action = props.action

    if (typeof action !== 'function') {
      emit('submit', output)
      return
    }

    clearErrors()
    const saved = context.getValues() as FormValues

    let result: unknown
    try {
      result = await action(output)
    } catch (thrown) {
      // Caught, never re-thrown: Formwerk would leave `isSubmitting` true, and
      // Vue would report a refused request as a crash.
      fail(thrown, output)
      return
    }

    if (props.resetOnSuccess) await reset()
    else rebaseline(saved)
    emit('success', result, output)
  })

  function onSubmit(event?: Event): Promise<void> {
    // The first submit is still saving. Only an awaited action can be in that
    // state for long; a form that emits `submit` is left exactly as it was.
    if (typeof props.action === 'function' && isSubmitting.value) {
      event?.preventDefault()
      return Promise.resolve()
    }
    return submitValid(event)
  }

  // ─── Leaving ─────────────────────────────────────────────

  const leaveGuard = useUnsavedChangesGuard(() => isDirty(), {
    enabled: () => props.confirmLeave === true,
  })

  return {
    values,
    context,
    isSubmitting,
    wasSubmitted,
    isDirty,
    isTouched,
    isValid,
    formErrors,
    submitError,
    leaveGuard,
    onSubmit,
    setErrors,
    clearErrors,
    setValues,
    reset,
  }
}
