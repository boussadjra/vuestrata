/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth 2.0 flows.
 * Uses the Web Crypto API — framework-agnostic, no external dependencies.
 */

const VERIFIER_LENGTH = 64
const STATE_LENGTH = 32

/**
 * Convert a byte array to base64url. Uses chunked `String.fromCharCode` so
 * we never spread a multi-megabyte typed array into the call stack — spread
 * arguments share the engine's argument-count limit and can throw
 * `RangeError: Maximum call stack size exceeded` on large inputs.
 */
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomBase64Url(length: number): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(length)))
}

/**
 * Generate a cryptographically random `code_verifier` (43-128 chars, RFC 7636).
 * `byteLength` controls the entropy source size; the resulting string is
 * roughly `ceil(byteLength * 4 / 3)` characters after base64url encoding.
 */
export function generateCodeVerifier(byteLength: number = VERIFIER_LENGTH): string {
  return randomBase64Url(byteLength)
}

/** Derive `code_challenge` from a verifier using SHA-256 (S256 method). */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToBase64Url(new Uint8Array(digest))
}

/** Generate a cryptographically random `state` parameter for CSRF protection. */
export function generateState(byteLength: number = STATE_LENGTH): string {
  return randomBase64Url(byteLength)
}
