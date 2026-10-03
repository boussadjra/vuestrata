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
 * An error body is input from the network, and is read as such. A field may be
 * named `constructor` or `__proto__`, a list may hold numbers, a serializer may
 * nest thousands deep, a message may be two megabytes of HTML. None of that may
 * throw, since a mapper that throws is skipped and the next one reads less;
 * none of it may reach `Object.prototype`; and a message stays the text it was
 * sent as, never markup.
 *
 * Framework-agnostic.
 */
import { readErrorBody, type MappedError } from '~/lib/errors'

import type { ApiErrorMapper } from './integration'

/**
 * Field messages while they are collected. A `Map`, not an object: a field
 * named `toString` would otherwise find `Object.prototype.toString` where its
 * list should be.
 */
type Details = Map<string, string[]>

/** What a mapper collects, before it is trimmed to what it found. */
interface Reading extends Omit<MappedError, 'details'> {
  details?: Details
}

/**
 * The longest message kept. A validation message is a sentence; anything far
 * longer is a stack trace or a page, and a toast is no place for either.
 */
const MAX_MESSAGE_LENGTH = 2_000

/** How deep a nested error tree is followed. Real serializers nest a handful of levels. */
const MAX_DEPTH = 16

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clip(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? clip(value) : undefined
}

/** A message, or a list of them, as a list. Anything else is no messages. */
function messagesOf(value: unknown): string[] {
  if (!Array.isArray(value)) {
    const message = text(value)
    return message === undefined ? [] : [message]
  }
  const messages: string[] = []
  for (const entry of value) {
    const message = text(entry)
    if (message !== undefined) messages.push(message)
  }
  return messages
}

/** Append one by one: a spread of a very long list overflows the stack. */
function append(target: string[], messages: readonly string[]): void {
  for (const message of messages) target.push(message)
}

function addMessages(details: Details, key: string, messages: string[]): void {
  if (messages.length === 0) return
  const known = details.get(key)
  if (known === undefined) details.set(key, [...messages])
  else append(known, messages)
}

/**
 * The collected messages as the plain object `AppError.details` is. Built from
 * entries, which defines every key as the object's own property: a field named
 * `__proto__` becomes a key like any other instead of replacing the prototype.
 */
function toDetails(details: Details | undefined): Record<string, string[]> | undefined {
  return details && details.size > 0 ? Object.fromEntries(details) : undefined
}

/** `undefined` instead of an empty object or list, so an absent field stays absent. */
function compact(mapped: Reading): MappedError | null {
  const result: MappedError = {}
  const details = toDetails(mapped.details)
  if (mapped.message) result.message = mapped.message
  if (mapped.code) result.code = mapped.code
  if (details) result.details = details
  if (mapped.formErrors && mapped.formErrors.length > 0) result.formErrors = mapped.formErrors
  if (mapped.requestId) result.requestId = mapped.requestId
  return Object.keys(result).length > 0 ? result : null
}

/**
 * The answer of a mapper that recognised its format, even when it found
 * nothing worth reporting. An empty object, not `null`: the body is this
 * mapper's, and handing it on would let a later one misread it.
 */
function claimed(mapped: Reading): MappedError {
  return compact(mapped) ?? {}
}

/**
 * A mapper that answers `null` where it would have thrown.
 *
 * The readers below are written not to throw on anything JSON can hold. This
 * is for the day one of them is wrong about that: the body goes to the next
 * mapper, as a body in another format does, rather than out of the client as
 * an exception.
 */
function defineMapper(read: ApiErrorMapper): ApiErrorMapper {
  return (context) => {
    try {
      return read(context)
    } catch {
      return null
    }
  }
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
export const problemJsonErrorMapper: ApiErrorMapper = defineMapper((context) => {
  const body = context.body
  if (!isRecord(body)) return null
  const declared = context.contentType === 'application/problem+json'
  const shaped =
    typeof body.title === 'string' &&
    (typeof body.status === 'number' || typeof body.type === 'string')
  if (!declared && !shaped) return null

  const details: Details = new Map()
  const formErrors: string[] = []

  if (isRecord(body.errors)) {
    for (const [field, value] of Object.entries(body.errors)) {
      const messages = messagesOf(value)
      if (field === '' || field === '$') append(formErrors, messages)
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
})

/**
 * Laravel: `{ message, errors: { field: ["…"] } }` from a failed validation
 * (422), `{ message }` from everything else. Nested input is already keyed by
 * a dotted path (`items.0.qty`).
 */
export const laravelErrorMapper: ApiErrorMapper = defineMapper((context) => {
  const body = context.body
  if (!isRecord(body)) return null
  if (typeof body.message !== 'string' && !isRecord(body.errors)) return null

  const details: Details = new Map()
  if (isRecord(body.errors)) {
    for (const [field, value] of Object.entries(body.errors)) {
      addMessages(details, field, messagesOf(value))
    }
  }
  return claimed({ message: meaningful(body.message), details })
})

/** Keys DRF uses for errors that belong to the whole input, not to a field. */
const DRF_FORM_KEYS = ['non_field_errors', '__all__']

/**
 * Flatten DRF's nested error tree into dotted paths. A list of strings is a
 * field's messages; an object is a nested serializer; a list of objects is a
 * `many=True` serializer, indexed by position (an empty object is a valid row).
 *
 * Stops at `MAX_DEPTH`. The tree comes from the network, and recursion that
 * follows it all the way down is a stack overflow one response can cause.
 */
function collectDrf(
  value: unknown,
  path: string,
  details: Details,
  formErrors: string[],
  depth = 0,
): void {
  if (depth > MAX_DEPTH) return
  if (Array.isArray(value)) {
    const messages = messagesOf(value)
    if (messages.length > 0) {
      const key = path.split('.').at(-1) ?? ''
      if (path === '' || DRF_FORM_KEYS.includes(key)) append(formErrors, messages)
      else addMessages(details, path, messages)
    }
    value.forEach((entry, index) => {
      if (!isRecord(entry)) return
      const row = path ? `${path}.${index}` : String(index)
      collectDrf(entry, row, details, formErrors, depth + 1)
    })
    return
  }
  if (!isRecord(value)) return
  for (const [key, entry] of Object.entries(value)) {
    collectDrf(entry, path ? `${path}.${key}` : key, details, formErrors, depth + 1)
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
export const drfErrorMapper: ApiErrorMapper = defineMapper((context) => {
  const body = context.body
  const details: Details = new Map()
  const formErrors: string[] = []

  if (Array.isArray(body)) {
    collectDrf(body, '', details, formErrors)
    return compact({ message: soleMessage(formErrors), details, formErrors })
  }
  if (!isRecord(body)) return null

  const { detail, code } = body
  for (const [key, entry] of Object.entries(body)) {
    if (key === 'detail' || key === 'code') continue
    collectDrf(entry, key, details, formErrors, 1)
  }
  const message = meaningful(detail) ?? soleMessage(formErrors)
  if (typeof detail !== 'string' && details.size === 0 && formErrors.length === 0) {
    return null
  }

  return claimed({ message, code: text(code), details, formErrors })
})

/**
 * NestJS: `{ statusCode, message, error }`. `message` is a string for a thrown
 * `HttpException` and a list for a `ValidationPipe` failure. The list carries
 * no field names, only sentences ("email must be an email"), so its entries
 * are form errors. `error` is the reason phrase, and so is `message` for an
 * exception thrown without one; neither is used as a message.
 */
export const nestErrorMapper: ApiErrorMapper = defineMapper((context) => {
  const body = context.body
  if (!isRecord(body) || typeof body.statusCode !== 'number') return null

  if (Array.isArray(body.message)) {
    const formErrors = messagesOf(body.message)
    return claimed({ message: soleMessage(formErrors), formErrors })
  }
  return claimed({ message: meaningful(body.message) })
})

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
export const springBootErrorMapper: ApiErrorMapper = defineMapper((context) => {
  const body = context.body
  if (!isRecord(body) || !Object.hasOwn(body, 'timestamp') || typeof body.status !== 'number') {
    return null
  }

  const details: Details = new Map()
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
})

/** Every shipped mapper, by the name its framework goes by. */
export const errorMappers = {
  vuestrata: vuestrataErrorMapper,
  problemJson: problemJsonErrorMapper,
  laravel: laravelErrorMapper,
  drf: drfErrorMapper,
  nest: nestErrorMapper,
  springBoot: springBootErrorMapper,
} as const
