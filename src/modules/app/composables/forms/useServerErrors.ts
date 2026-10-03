import { normalizeError, type AppError } from '~/lib/errors'
import type { FormFieldPathStrategy } from '~/types/forms'

/**
 * What the server said about a submitted form, put where the user can act on
 * it: beside the field it is about, or at the top of the form when it is about
 * no field this form has.
 *
 * `AppError.details` arrives keyed by the backend's own field path, verbatim:
 * `Email` and `Items[0].Quantity` from ASP.NET, `contact_name` from Laravel,
 * `items.1.qty` from Django REST Framework. A form names its fields its own
 * way, so each key is tried against the fields the form really has:
 *
 *   1. the form's `fieldMap`, for the keys only a person can match
 *      (`{ 'Address.City': 'city' }`);
 *   2. the key as the backend spelled it, with bracket indices written as dots
 *      (`Items[0].Name` → `Items.0.Name`), for a form that names its fields
 *      the way the backend does;
 *   3. the same with every segment in camelCase (`items.0.name`,
 *      `contactName`), which is what a form written in TypeScript uses.
 *
 * A key that matches no field is never dropped. Its messages become form-level
 * ones, prefixed with the key so the user can still tell what they are about.
 *
 * Messages are text. Nothing here interprets them, and the components that
 * show them interpolate, so markup in a message is displayed, not rendered.
 */

/** Messages by field path. Has no prototype: a path may be `constructor`. */
export type FieldErrors = Record<string, string[]>

export interface ServerErrorMapping {
  /** Messages by the form's own field path. */
  fields: FieldErrors
  /** Messages that belong to the form as a whole. */
  form: string[]
}

export interface ServerErrorOptions {
  /** Backend key → form field path. Read first, and only by the exact key. */
  fieldMap?: Readonly<Record<string, string>>
  /** Replaces steps 2 and 3 above with one path of the caller's choosing. */
  fieldPath?: FormFieldPathStrategy
  /**
   * Whether the form shows a field at this path. Without it every path counts
   * as a field, and a message for a field the form lacks would go unseen.
   */
  hasField?: (path: string) => boolean
}

function emptyFieldErrors(): FieldErrors {
  return Object.create(null) as FieldErrors
}

/** A bare segment, or a bracketed one: `[0]`, `['key']`, `["key"]`. */
const SEGMENT = /[^.[\]]+|\[(?:'([^']*)'|"([^"]*)"|([^\]]*))\]/g

/**
 * The segments of a backend field key. `$` is where ASP.NET roots a path into
 * the request body (`$.items[0].qty`), which no form field is named after.
 */
function segmentsOf(key: string): string[] {
  const segments: string[] = []
  for (const match of key.matchAll(SEGMENT)) {
    const segment = (match[1] ?? match[2] ?? match[3] ?? match[0]).trim()
    if (segment) segments.push(segment)
  }
  return segments[0] === '$' ? segments.slice(1) : segments
}

const INDEX = /^\d+$/
const SEPARATED = /[_\-\s]+(.)?/g
const SHOUTING = /^[A-Z0-9_\-\s]+$/

/**
 * One segment in camelCase, the way a JSON serializer would have written it:
 * `ContactName` and `contact_name` → `contactName`, `IPAddress` → `ipAddress`,
 * `URL` → `url`. An index is left alone.
 */
function camelSegment(segment: string): string {
  if (INDEX.test(segment)) return segment
  const words = SHOUTING.test(segment) ? segment.toLowerCase() : segment
  const joined = words.replace(SEPARATED, (_, next: string | undefined) =>
    next ? next.toUpperCase() : '',
  )
  // A leading run of capitals is an acronym: lower all of it, except the
  // capital that starts the next word.
  return joined.replace(/^[A-Z]+(?=[A-Z][a-z])|^[A-Z]+/, (run) => run.toLowerCase())
}

/** `Items[0].Name` → `Items.0.Name`: the backend's spelling, as a dot path. */
export function toDotPath(key: string): string {
  return segmentsOf(key).join('.')
}

/**
 * `Items[0].Name` → `items.0.name`, `contact_name` → `contactName`: the path a
 * form written in TypeScript gives the same field.
 */
export function toFormFieldPath(key: string): string {
  return segmentsOf(key).map(camelSegment).join('.')
}

/**
 * Whether an error's `details` describe the fields of the request.
 *
 * Only a 4xx the server answered with does. A response that broke the agreed
 * shape (`CONTRACT_MISMATCH`) carries `details` too, but they are paths into
 * the response, and a 5xx's have already been dropped by the API client.
 */
function describesFields(error: AppError): boolean {
  if (error.kind !== undefined && error.kind !== 'http') return false
  return error.status >= 400 && error.status < 500
}

/** The messages in a value that came off the wire: strings, and nothing else. */
function messagesOf(value: unknown): string[] {
  const candidates: unknown[] = Array.isArray(value) ? value : [value]
  return candidates.filter(
    (candidate): candidate is string => typeof candidate === 'string' && candidate.trim() !== '',
  )
}

function addUnique(target: string[], messages: string[]): void {
  for (const message of messages) if (!target.includes(message)) target.push(message)
}

function fieldPathFor(key: string, options: ServerErrorOptions): string | undefined {
  const hasField = options.hasField ?? (() => true)
  const { fieldMap, fieldPath } = options

  // `Object.hasOwn`, not `key in fieldMap`: a backend can name a field
  // `constructor`, and every object has one of those.
  const candidates =
    fieldMap && Object.hasOwn(fieldMap, key)
      ? [fieldMap[key]!]
      : fieldPath
        ? [fieldPath(key)]
        : [toDotPath(key), toFormFieldPath(key)]

  return candidates.find((path) => typeof path === 'string' && path !== '' && hasField(path))
}

/**
 * Split what a failed submit says into messages for fields and messages for
 * the form. Anything that is not a validation failure yields neither: its one
 * line for the user is `describeError()`'s to give.
 */
export function mapServerErrors(
  error: unknown,
  options: ServerErrorOptions = {},
): ServerErrorMapping {
  const failure = normalizeError(error)
  const mapping: ServerErrorMapping = { fields: emptyFieldErrors(), form: [] }
  if (!describesFields(failure)) return mapping

  addUnique(mapping.form, messagesOf(failure.formErrors))

  const details: unknown = failure.details
  if (typeof details !== 'object' || details === null) return mapping

  // `Object.entries`, never an index: see `fieldPathFor`.
  for (const [key, value] of Object.entries(details)) {
    const messages = messagesOf(value)
    if (messages.length === 0) continue

    const path = fieldPathFor(key, options)
    if (path === undefined) {
      addUnique(
        mapping.form,
        messages.map((message) => (key ? `${key}: ${message}` : message)),
      )
      continue
    }
    addUnique((mapping.fields[path] ??= []), messages)
  }

  return mapping
}

/**
 * The server's messages for one form, as state.
 *
 * `UiForm` owns one and feeds it from its `action`; a form built without
 * `UiForm` can own one too and pass `errorsFor('email')[0]` to the field's
 * `error` prop. `options` may be a getter, so a `fieldMap` that arrives as a
 * prop is read when an error is applied, not when the form was set up.
 */
export function useServerErrors(options: ServerErrorOptions | (() => ServerErrorOptions) = {}) {
  const fieldErrors = shallowRef<FieldErrors>(emptyFieldErrors())
  const formErrors = shallowRef<string[]>([])

  const current = () => (typeof options === 'function' ? options() : options)

  /** Show what a failed submit said. Replaces whatever was shown before. */
  function apply(error: unknown): ServerErrorMapping {
    const mapping = mapServerErrors(error, current())
    fieldErrors.value = mapping.fields
    formErrors.value = mapping.form
    return mapping
  }

  /**
   * Show messages the caller already holds, keyed by the form's own field
   * paths. The empty key is the form itself, and so is a path with no field.
   */
  function set(errors: Readonly<Record<string, string | string[]>>): void {
    const hasField = current().hasField ?? (() => true)
    const fields = emptyFieldErrors()
    const form: string[] = []

    for (const [path, value] of Object.entries(errors)) {
      const messages = messagesOf(value)
      if (messages.length === 0) continue
      // Stored under the dotted spelling, whichever the caller used.
      const key = path.includes('[') ? toDotPath(path) : path
      if (path === '') addUnique(form, messages)
      else if (hasField(key)) addUnique((fields[key] ??= []), messages)
      else
        addUnique(
          form,
          messages.map((message) => `${path}: ${message}`),
        )
    }

    fieldErrors.value = fields
    formErrors.value = form
  }

  /**
   * Forget the messages for a field and everything nested under it, or with no
   * path, all of them, the form's own included.
   */
  function clear(path?: string): void {
    if (path === undefined) {
      fieldErrors.value = emptyFieldErrors()
      formErrors.value = []
      return
    }

    const entries = Object.entries(fieldErrors.value)
    const kept = entries.filter(([key]) => key !== path && !key.startsWith(`${path}.`))
    if (kept.length === entries.length) return

    const next = emptyFieldErrors()
    for (const [key, messages] of kept) next[key] = messages
    fieldErrors.value = next
  }

  /** The messages for a field and everything nested under it. */
  function errorsFor(path?: string): string[] {
    const entries = Object.entries(fieldErrors.value)
    if (entries.length === 0) return []
    if (!path) return entries.flatMap(([, messages]) => messages)
    return entries
      .filter(([key]) => key === path || key.startsWith(`${path}.`))
      .flatMap(([, messages]) => messages)
  }

  return { fieldErrors, formErrors, apply, set, clear, errorsFor }
}
