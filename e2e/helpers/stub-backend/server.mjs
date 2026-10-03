#!/usr/bin/env node
/**
 * A stand-in for a Laravel backend with Sanctum's SPA authentication, for the
 * browser tests in `e2e/integration/`. `node:http` and nothing else.
 *
 * It serves a built `dist/` and, on the SAME origin, the API that build talks
 * to, so a real browser keeps a real cookie jar for it:
 *
 *   GET  /sanctum/csrf-cookie  sets XSRF-TOKEN (readable, percent-encoded) and
 *                              the session cookie (HttpOnly, SameSite=Lax); 204
 *   POST /login                419 without the current token in X-XSRF-TOKEN;
 *                              422 `{ message, errors }` for wrong credentials;
 *                              else 204, with a NEW session id and token
 *   POST /logout               ends the session; 204
 *   GET  /api/user             the user in snake_case, or 401
 *   GET  /api/customers        a paginator page, or 401
 *   POST /api/customers        419 on a stale token, else 201 `{ data }`
 *   GET  /api/customers/:id    `{ data }`, or 404
 *
 * And what only a test needs, under `/__stub/`:
 *
 *   POST /__stub/expire-session  every session forgets who it belongs to
 *   POST /__stub/stale-token     every session gets a new token, and the
 *                                browser is not told
 *   GET  /__stub/requests        what was asked since the last reset
 *   POST /__stub/reset           forget everything
 *
 * Usage: node e2e/helpers/stub-backend/server.mjs --dist <dir> [--port 4174]
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The one account, and its password. Test data, not a credential for anything. */
export const STUB_ACCOUNT = { email: 'ada@example.test', password: 'correct-horse' }

const USER = {
  id: 7,
  name: 'Ada Lovelace',
  email: STUB_ACCOUNT.email,
  email_verified_at: '2026-01-05T10:00:00.000000Z',
  role: 'admin',
}

/** The routes Laravel serves beside its API, at the root of the origin. */
const BACKEND_ROUTES = ['/sanctum/csrf-cookie', '/login', '/logout']

const SESSION_COOKIE = 'laravel_session'
const TOKEN_COOKIE = 'XSRF-TOKEN'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
}

// Laravel's token is base64, so it holds characters a cookie percent-encodes
// (25 bytes always end in "=="). A client that sends the cookie without decoding
// it is refused.
const newToken = () => randomBytes(25).toString('base64')
const newId = () => randomBytes(20).toString('hex')

function customer(id, draft = {}) {
  return {
    id,
    company: 'Analytical Engines Ltd',
    contactName: 'Charles Babbage',
    email: 'charles@engines.example',
    phone: '+44 20 7946 0000',
    status: 'active',
    plan: 'growth',
    city: 'London',
    country: 'GB',
    owner: USER.name,
    mrr: { amount: 120_000, currency: 'USD' },
    lifetimeValue: { amount: 2_400_000, currency: 'USD' },
    openOrders: 0,
    since: '2026-01-05T10:00:00.000Z',
    lastContactAt: '2026-03-01T09:00:00.000Z',
    notes: '',
    ...draft,
  }
}

/**
 * @param {{ dist: string }} options The built app to serve.
 * @returns {import('node:http').Server}
 */
export function createStubBackend({ dist }) {
  const root = resolve(dist)
  /** Session id → `{ token, user }`. `user` is null until somebody signs in. */
  let sessions = new Map()
  let customers = [customer('CUS-1000')]
  let requests = []

  const cookiesOf = (request) =>
    Object.fromEntries(
      (request.headers.cookie ?? '')
        .split(';')
        .map((pair) => pair.trim().split('='))
        .filter(([name]) => name)
        .map(([name, ...value]) => [name, value.join('=')]),
    )

  const sessionOf = (request) => sessions.get(cookiesOf(request)[SESSION_COOKIE])

  /** A new session, replacing `previous`: the id and the token both change. */
  function startSession(request, user = null) {
    sessions.delete(cookiesOf(request)[SESSION_COOKIE])
    const id = newId()
    const session = { token: newToken(), user }
    sessions.set(id, session)
    return [
      `${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax`,
      `${TOKEN_COOKIE}=${encodeURIComponent(session.token)}; Path=/; SameSite=Lax`,
    ]
  }

  const tokenMatches = (request) => {
    const session = sessionOf(request)
    return Boolean(session) && request.headers['x-xsrf-token'] === session.token
  }

  async function bodyOf(request) {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch {
      return {}
    }
  }

  function json(response, status, body, cookies) {
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(cookies ? { 'Set-Cookie': cookies } : {}),
    })
    response.end(JSON.stringify(body))
  }

  function empty(response, cookies) {
    response.writeHead(204, cookies ? { 'Set-Cookie': cookies } : {})
    response.end()
  }

  const unauthenticated = (response) => json(response, 401, { message: 'Unauthenticated.' })
  const tokenMismatch = (response) => json(response, 419, { message: 'CSRF token mismatch.' })

  function serveStatic(pathname, response) {
    const file = normalize(join(root, decodeURIComponent(pathname)))
    const inside = file === root || file.startsWith(root + sep)
    const found = inside && existsSync(file) && statSync(file).isFile()
    // Anything that is not a file is a route of the app: the SPA fallback.
    const target = found ? file : join(root, 'index.html')
    response.writeHead(200, {
      'Content-Type': MIME[extname(target)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    response.end(readFileSync(target))
  }

  async function handle(request, response) {
    const { pathname } = new URL(request.url, 'http://stub.invalid')
    const method = request.method ?? 'GET'
    const route = `${method} ${pathname}`
    const writes = method !== 'GET' && method !== 'HEAD'

    // ── What only a test asks for ───────────────────────────────────────────
    if (route === 'POST /__stub/expire-session') {
      for (const session of sessions.values()) session.user = null
      return empty(response)
    }
    if (route === 'POST /__stub/stale-token') {
      for (const session of sessions.values()) session.token = newToken()
      return empty(response)
    }
    if (route === 'GET /__stub/requests') return json(response, 200, requests)
    if (route === 'POST /__stub/reset') {
      sessions = new Map()
      customers = [customer('CUS-1000')]
      requests = []
      return empty(response)
    }

    // ── The backend's own routes, at the root of the origin ─────────────────
    if (route === 'GET /sanctum/csrf-cookie') {
      const session = sessionOf(request)
      // An existing session keeps its id; only a visitor without one gets one.
      if (!session) return empty(response, startSession(request))
      return empty(response, [
        `${TOKEN_COOKIE}=${encodeURIComponent(session.token)}; Path=/; SameSite=Lax`,
      ])
    }
    if (route === 'POST /login') {
      if (!tokenMatches(request)) return tokenMismatch(response)
      const { email, password } = await bodyOf(request)
      if (email !== STUB_ACCOUNT.email || password !== STUB_ACCOUNT.password) {
        const message = 'These credentials do not match our records.'
        return json(response, 422, { message, errors: { email: [message] } })
      }
      // A new id and a new token with the sign-in, against session fixation.
      return empty(response, startSession(request, USER))
    }
    if (route === 'POST /logout') {
      if (!tokenMatches(request)) return tokenMismatch(response)
      return empty(response, startSession(request))
    }

    // ── The API ─────────────────────────────────────────────────────────────
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const session = sessionOf(request)
      if (!session?.user) return unauthenticated(response)
      if (writes && !tokenMatches(request)) return tokenMismatch(response)

      if (route === 'GET /api/user') return json(response, 200, session.user)
      if (route === 'GET /api/customers') {
        return json(response, 200, {
          data: customers,
          meta: { current_page: 1, per_page: 10, last_page: 1, total: customers.length },
        })
      }
      if (route === 'POST /api/customers') {
        const created = customer(`CUS-${1000 + customers.length}`, await bodyOf(request))
        customers = [...customers, created]
        return json(response, 201, { data: created })
      }
      const found = /^\/api\/customers\/([^/]+)$/.exec(pathname)
      const record = found && customers.find((entry) => entry.id === decodeURIComponent(found[1]))
      if (method === 'GET' && record) return json(response, 200, { data: record })
      return json(response, 404, { message: 'Not Found' })
    }

    if (method !== 'GET' && method !== 'HEAD') return json(response, 404, { message: 'Not Found' })
    return serveStatic(pathname, response)
  }

  return createServer((request, response) => {
    const { pathname } = new URL(request.url, 'http://stub.invalid')
    // Recorded as the test reads them: what the backend was asked, and with
    // which credentials. The app's own files are not the backend's business.
    const backend = pathname.startsWith('/api') || BACKEND_ROUTES.includes(pathname)
    response.on('finish', () => {
      if (!backend) return
      requests.push({
        method: request.method,
        path: pathname,
        status: response.statusCode,
        xsrf: request.headers['x-xsrf-token'] ?? null,
        // The cookie as the browser sent it, still percent-encoded.
        tokenCookie: cookiesOf(request)[TOKEN_COOKIE] ?? null,
        authorization: request.headers.authorization ?? null,
        session: cookiesOf(request)[SESSION_COOKIE] ?? null,
      })
    })
    handle(request, response).catch((error) => {
      response.writeHead(500, { 'Content-Type': 'text/plain' })
      response.end(String(error))
    })
  })
}

// ── Run as a script ─────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argument = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`)
    return index === -1 ? fallback : process.argv[index + 1]
  }
  const dist = argument('dist', 'dist')
  const port = Number(argument('port', '4174'))

  if (!existsSync(join(resolve(dist), 'index.html'))) {
    process.stderr.write(
      `[stub-backend] ${resolve(dist)} has no index.html. Build the app for it first: ` +
        'node e2e/integration/build.mjs\n',
    )
    process.exit(1)
  }
  createStubBackend({ dist }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`[stub-backend] serving ${resolve(dist)} on http://127.0.0.1:${port}\n`)
  })
}
