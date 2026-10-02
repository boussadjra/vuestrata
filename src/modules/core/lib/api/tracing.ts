/**
 * Correlation headers: what lets a failure a user reports be found in the
 * backend's logs.
 *
 * Both are OFF by default, and that is deliberate. Neither `X-Request-Id` nor
 * `traceparent` is a CORS-safelisted header, so sending one turns every
 * cross-origin `GET` into two requests (a preflight, then the request) and
 * fails outright against a backend whose `Access-Control-Allow-Headers` does
 * not name it. A project turns them on in `app/config/api.overrides.ts` once
 * its backend allows them.
 *
 * Framework-agnostic, and free of `crypto.randomUUID`, which only exists in a
 * secure context: an intranet app served over plain HTTP has no such function.
 */

/** Which correlation headers the API client sends. */
export interface ApiTracing {
  /** Send a fresh request id with every request, and report it on a failure. */
  requestId: boolean
  /**
   * The header the request id travels in, in both directions: it is also the
   * response header a failure's `requestId` is read from.
   */
  requestIdHeader: string
  /** Send a W3C Trace Context `traceparent`, with a new trace per request. */
  traceparent: boolean
  /**
   * The `sampled` flag of that `traceparent`. On by default, which asks a
   * backend that honours the caller's decision (OpenTelemetry's parent-based
   * sampler, the usual default) to record EVERY request the app makes. Turn it
   * off to leave the decision to the backend's own sampler; the ids are sent
   * either way, so a failure can still be correlated.
   */
  sampled: boolean
}

/** What `tracing` accepts in the overrides: `true` for both headers, or a choice. */
export type ApiTracingOptions = boolean | Partial<ApiTracing>

export const DEFAULT_TRACING: ApiTracing = Object.freeze({
  requestId: false,
  requestIdHeader: 'X-Request-Id',
  traceparent: false,
  sampled: true,
})

/** The full settings for whatever the overrides said. */
export function resolveTracing(options: ApiTracingOptions | undefined): ApiTracing {
  if (options === undefined || options === false) return DEFAULT_TRACING
  if (options === true) return { ...DEFAULT_TRACING, requestId: true, traceparent: true }
  return {
    requestId: options.requestId ?? DEFAULT_TRACING.requestId,
    requestIdHeader: options.requestIdHeader || DEFAULT_TRACING.requestIdHeader,
    traceparent: options.traceparent ?? DEFAULT_TRACING.traceparent,
    sampled: options.sampled ?? DEFAULT_TRACING.sampled,
  }
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes)
  const source = (globalThis as { crypto?: Pick<Crypto, 'getRandomValues'> }).crypto
  if (typeof source?.getRandomValues === 'function') {
    source.getRandomValues(buffer)
  } else {
    // An identifier, not a secret: uniqueness is all it needs.
    for (let index = 0; index < bytes; index++) buffer[index] = Math.floor(Math.random() * 256)
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** A new request id, in UUID v4 form. */
export function createRequestId(): string {
  const hex = randomHex(16)
  // The version and variant bits are what make it a v4 UUID and not 32 hex digits.
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}

/**
 * A `traceparent` for a request that starts a trace: version `00`, a 16-byte
 * trace id, an 8-byte parent id, and the trace flags: `01` when `sampled`,
 * `00` when the decision is left to the backend.
 *
 * The browser is the root of the trace, so the ids are new each time. A random
 * id is all-zero (which the spec forbids) once in 2^128 requests.
 */
export function createTraceparent(sampled = true): string {
  return `00-${randomHex(16)}-${randomHex(8)}-${sampled ? '01' : '00'}`
}
