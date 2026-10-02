/**
 * Error mappers: one per error-body format a backend framework produces.
 *
 * A mapper is given a failed response and returns what it recognised
 * (`message`, `code`, `details`, `formErrors`, `requestId`) or `null` when the
 * body is not in its format, so several can be listed and the first that
 * recognises a body wins. The API client turns the result into an `AppError`;
 * whatever the mapper returns, a 5xx never shows its message to a user.
 *
 * `details` keeps the backend's own field paths. A key is copied as it was
 * sent (`contact_name`, `Address.City`), and where a format nests or points
 * instead of naming a path, the path is spelled with dots: DRF's
 * `{ items: [{}, { qty: [...] }] }` and a JSON Pointer `#/items/1/qty` both
 * become `items.1.qty`. Nothing is renamed to camelCase here: the form layer
 * matches keys to fields, and it needs the original to do it.
 *
 * Framework-agnostic.
 */
import { readErrorBody, type MappedError } from '~/lib/errors'

import type { ApiErrorMapper } from './integration'

type Details = Record<string, string[]>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** A message, or a list of them, as a list. Anything else is no messages. */
function messagesOf(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
}

function addMessages(details: Details, key: string, messages: string[]): void {
  if (messages.length === 0) return
  ;(details[key] ??= []).push(...messages)
}

/** `undefined` instead of an empty object or list, so an absent field stays absent. */
function compact(mapped: MappedError): MappedError | null {
  const result: MappedError = {}
  if (mapped.message) result.message = mapped.message
  if (mapped.code) result.code = mapped.code
  if (mapped.details && Object.keys(mapped.details).length > 0) result.details = mapped.details
  if (mapped.formErrors && mapped.formErrors.length > 0) result.formErrors = mapped.formErrors
  if (mapped.requestId) result.requestId = mapped.requestId
  return Object.keys(result).length > 0 ? result : null
}

/**
 * The answer of a mapper that recognised its format, even when it found
 * nothing worth reporting. An empty object, not `null`: the body is this
 * mapper's, and handing it on would let a later one misread it.
 */
function claimed(mapped: MappedError): MappedError {
  return compact(mapped) ?? {}
}

/**
 * HTTP reason phrases. Frameworks fill an error's message with one when the
 * application supplied none ("Not Found", "Forbidden"), and that says nothing
 * the status does not: left out, the user reads the status's own message in
 * their language instead of two English words.
 */
const REASON_PHRASES = [
  'bad request',
  'unauthorized',
  'forbidden',
  'not found',
  'method not allowed',
  'not acceptable',
  'request timeout',
  'conflict',
  'gone',
  'precondition failed',
  'payload too large',
  'unsupported media type',
  'unprocessable entity',
  'unprocessable content',
  'too many requests',
  'internal server error',
  'not implemented',
  'bad gateway',
  'service unavailable',
  'gateway timeout',
]

/** A message that says something: not empty, and not just the reason phrase. */
function meaningful(value: unknown): string | undefined {
  const message = text(value)
  if (!message) return undefined
  const bare = message.trim().replace(/\.$/, '').toLowerCase()
  return REASON_PHRASES.includes(bare) ? undefined : message
}

/** One message when there is exactly one; with several, none of them is "the" message. */
function soleMessage(messages: string[]): string | undefined {
  return messages.length === 1 ? messages[0] : undefined
}

/**
 * Vuestrata's own shape: `{ message, code, details, requestId }`. Always the
 * last mapper, and the one that never answers `null`: for a body in no known
 * format it reports nothing, and the error falls back to the status.
 */
export const vuestrataErrorMapper: ApiErrorMapper = (context) => readErrorBody(context.body)

/** `#/items/1/qty` or `/items/1/qty` as `items.1.qty`; anything else unchanged. */
function pointerToPath(pointer: string): string {
  const path = pointer.startsWith('#') ? pointer.slice(1) : pointer
  if (!path.startsWith('/')) return pointer
  return path
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .join('.')
}

/**
 * RFC 9457 problem details (`application/problem+json`), including what
 * ASP.NET Core adds to it.
 *
 * `detail` is the message, falling back to `title` unless that is only the
 * reason phrase, which is what ASP.NET writes. Field errors are read from
 * `errors` in either form in use: ASP.NET's `ValidationProblemDetails`
 * (`{ "Email": ["…"], "Address.City": ["…"] }`) and the RFC's own example (a
 * list of `{ detail, pointer }`), plus RFC 7807's `invalid-params` (`{ name,
 * reason }`). An ASP.NET model-level error, keyed `""` or `"$"`, is a form
 * error. `traceId` is the request id.
 */
export const problemJsonErrorMapper: ApiErrorMapper = (context) => {
  const body = context.body
  if (!isRecord(body)) return null
  const declared = context.contentType === 'application/problem+json'
  const shaped =
    typeof body.title === 'string' &&
    (typeof body.status === 'number' || typeof body.type === 'string')
  if (!declared && !shaped) return null

  const details: Details = {}
  const formErrors: string[] = []

  if (isRecord(body.errors)) {
    for (const [field, value] of Object.entries(body.errors)) {
      const messages = messagesOf(value)
      if (field === '' || field === '$') formErrors.push(...messages)
      else addMessages(details, field, messages)
    }
  }
  const listed = Array.isArray(body.errors) ? body.errors : body['invalid-params']
  if (Array.isArray(listed)) {
    for (const entry of listed) {
      if (!isRecord(entry)) continue
      const message = text(entry.detail) ?? text(entry.message) ?? text(entry.reason)
      if (!message) continue
      const pointer = text(entry.pointer)
      const field = pointer ? pointerToPath(pointer) : (text(entry.field) ?? text(entry.name))
      if (field) addMessages(details, field, [message])
      else formErrors.push(message)
    }
  }

  // `about:blank` is the RFC's "no type": the status says it all.
  const type = text(body.type)
  return claimed({
    message: meaningful(body.detail) ?? meaningful(body.title),
    code: text(body.code) ?? (type && type !== 'about:blank' ? type : undefined),
    details,
    formErrors,
    requestId: text(body.traceId) ?? text(body.requestId),
  })
}

/**
 * Laravel: `{ message, errors: { field: ["…"] } }` from a failed validation
 * (422), `{ message }` from everything else. Nested input is already keyed by
 * a dotted path (`items.0.qty`).
 */
export const laravelErrorMapper: ApiErrorMapper = (context) => {
  const body = context.body
  if (!isRecord(body)) return null
  if (typeof body.message !== 'string' && !isRecord(body.errors)) return null

  const details: Details = {}
  if (isRecord(body.errors)) {
    for (const [field, value] of Object.entries(body.errors)) {
      addMessages(details, field, messagesOf(value))
    }
  }
  return claimed({ message: meaningful(body.message), details })
}

/** Keys DRF uses for errors that belong to the whole input, not to a field. */
const DRF_FORM_KEYS = ['non_field_errors', '__all__']

/**
 * Flatten DRF's nested error tree into dotted paths. A list of strings is a
 * field's messages; an object is a nested serializer; a list of objects is a
 * `many=True` serializer, indexed by position (an empty object is a valid row).
 */
function collectDrf(value: unknown, path: string, details: Details, formErrors: string[]): void {
  if (Array.isArray(value)) {
    const messages = messagesOf(value)
    if (messages.length > 0) {
      const key = path.split('.').at(-1) ?? ''
      if (path === '' || DRF_FORM_KEYS.includes(key)) formErrors.push(...messages)
      else addMessages(details, path, messages)
    }
    value.forEach((entry, index) => {
      if (!isRecord(entry)) return
      collectDrf(entry, path ? `${path}.${index}` : String(index), details, formErrors)
    })
    return
  }
  if (!isRecord(value)) return
  for (const [key, entry] of Object.entries(value)) {
    collectDrf(entry, path ? `${path}.${key}` : key, details, formErrors)
  }
}

/**
 * Django REST Framework: `{ detail }` for a refused request, and for a failed
 * validation a tree of `{ field: ["…"] }` with `non_field_errors` for what
 * belongs to no field. A custom exception handler's `code` is kept.
 *
 * A field's errors are always a list in DRF, which is what tells a field from
 * the scalar properties of some other format: `{ message: "…" }` is not DRF,
 * and is left to the next mapper.
 */
export const drfErrorMapper: ApiErrorMapper = (context) => {
  const body = context.body
  const details: Details = {}
  const formErrors: string[] = []

  if (Array.isArray(body)) {
    collectDrf(body, '', details, formErrors)
    return compact({ message: soleMessage(formErrors), details, formErrors })
  }
  if (!isRecord(body)) return null

  const { detail, code, ...fields } = body
  collectDrf(fields, '', details, formErrors)
  const message = meaningful(detail) ?? soleMessage(formErrors)
  if (typeof detail !== 'string' && Object.keys(details).length === 0 && formErrors.length === 0) {
    return null
  }

  return claimed({ message, code: text(code), details, formErrors })
}

/**
 * NestJS: `{ statusCode, message, error }`. `message` is a string for a thrown
 * `HttpException` and a list for a `ValidationPipe` failure. The list carries
 * no field names, only sentences ("email must be an email"), so its entries
 * are form errors. `error` is the reason phrase, and so is `message` for an
 * exception thrown without one; neither is used as a message.
 */
export const nestErrorMapper: ApiErrorMapper = (context) => {
  const body = context.body
  if (!isRecord(body) || typeof body.statusCode !== 'number') return null

  if (Array.isArray(body.message)) {
    const formErrors = messagesOf(body.message)
    return claimed({ message: soleMessage(formErrors), formErrors })
  }
  return claimed({ message: meaningful(body.message) })
}

/** What Spring writes when `server.error.include-message` is off. */
const SPRING_NO_MESSAGE = 'No message available'

/**
 * Spring Boot's default error body: `{ timestamp, status, error, message,
 * path }`, with `errors` (a list of `{ field, defaultMessage }`) when
 * `server.error.include-binding-errors` is on. An entry without a `field` is
 * an object-level error, which is a form error.
 *
 * `error` is the HTTP reason phrase ("Bad Request"), which says less than the
 * status's own translated message, so it is not used as one. Spring 6's
 * `ProblemDetail` is RFC 9457: list `problemJsonErrorMapper` for that.
 */
export const springBootErrorMapper: ApiErrorMapper = (context) => {
  const body = context.body
  if (!isRecord(body) || !('timestamp' in body) || typeof body.status !== 'number') return null

  const details: Details = {}
  const formErrors: string[] = []
  if (Array.isArray(body.errors)) {
    for (const entry of body.errors) {
      if (!isRecord(entry)) continue
      const message = text(entry.defaultMessage) ?? text(entry.message)
      if (!message) continue
      const field = text(entry.field)
      if (field) addMessages(details, field, [message])
      else formErrors.push(message)
    }
  }

  const message = meaningful(body.message)
  return claimed({
    message: message === SPRING_NO_MESSAGE ? undefined : message,
    details,
    formErrors,
    requestId: text(body.requestId),
  })
}

/** Every shipped mapper, by the name its framework goes by. */
export const errorMappers = {
  vuestrata: vuestrataErrorMapper,
  problemJson: problemJsonErrorMapper,
  laravel: laravelErrorMapper,
  drf: drfErrorMapper,
  nest: nestErrorMapper,
  springBoot: springBootErrorMapper,
} as const
