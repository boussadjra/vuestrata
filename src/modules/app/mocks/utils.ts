/**
 * Shared MSW mock helpers used across module-owned handlers.
 *
 * `isValidToken` validates the Bearer-token shape produced by the auth mock
 * adapter (an unsigned JWT prefixed with `mock-`). Lives here rather than
 * inside the auth module's mocks so non-auth modules (billing, users, etc.)
 * can authorize their requests without importing from `@/modules/auth`.
 */
export function isValidToken(request: Request): boolean {
  const auth = request.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return false
  const token = auth.slice('Bearer '.length)
  // Accept either the new unsigned-JWT format or the legacy
  // `mock-jwt-token-*` shape so existing fixtures keep working.
  return token.startsWith('mock-jwt-token-') || isMockJwt(token)
}

function isMockJwt(token: string): boolean {
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(base64UrlDecode(parts[1] ?? ''))
    return payload?.iss === 'vuestrata-mock'
  } catch {
    return false
  }
}

function base64UrlEncode(input: string): string {
  // btoa expects latin-1; encode as UTF-8 first to handle any non-ASCII.
  const utf8 = String.fromCharCode(...new TextEncoder().encode(input))
  return btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/**
 * Build an unsigned JWT for mock responses. The signature segment is a fixed
 * string (`mocksig`) — never trust this token outside the dev/test surface.
 * The token is decodable by `jwt-decode`, which the auth store relies on for
 * proactive refresh scheduling, so the mock contract stays honest with the
 * real adapter.
 */
export function createMockJwt(payload: {
  sub: string
  email?: string
  role?: string
  permissions?: string[]
  expiresInSeconds?: number
}): string {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'none', typ: 'JWT' }
  const body = {
    iss: 'vuestrata-mock',
    sub: payload.sub,
    email: payload.email,
    role: payload.role,
    permissions: payload.permissions ?? [],
    iat: now,
    exp: now + (payload.expiresInSeconds ?? 3600),
  }
  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(body))}.mocksig`
}
