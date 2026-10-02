/**
 * Vuestrata's Vite plugin: where the validated runtime environment meets the
 * build and the dev server.
 *
 * It lives here rather than inline in `vite.config.ts` so that it can belong to
 * Vuestrata, which keeps improving it, while the config that calls it stays the
 * project's own. `vuestrata-plugin.d.mts` beside it keeps that config typed.
 */
import { readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadEnv, parseAst } from 'vite-plus'

// Relative import, not an alias: this file runs in Node before `resolve.alias`
// exists. `env.schema.ts` is dependency-free for exactly this reason.
// Explicit .ts extension: the config may be loaded as native ESM, which does
// not do extensionless resolution.
import {
  AUTH_ADAPTERS,
  ENV_KEYS,
  parseRuntimeEnv,
} from '../../src/modules/core/lib/config/env.schema.ts'

/**
 * The seeded file a project registers its own auth adapters in, relative to
 * the Vite root. Not configurable: Vuestrata's bootstrap imports it from this
 * path.
 */
const AUTH_CONFIG_FILE = 'src/modules/app/config/auth.config.ts'

/** The same rule `auth/adapters/config.ts` applies when the app starts. */
const AUTH_ADAPTER_NAME = /^[a-z][a-z0-9-]*$/

/**
 * Where `vp dev` forwards API requests. Deliberately NOT `VUESTRATA_`-prefixed:
 * Vite inlines every variable with that prefix into the client bundle, and the
 * address of a developer's backend has no business shipping to users.
 */
const DEV_API_TARGET = 'DEV_API_TARGET'

/** The CSP `<meta>` in index.html, split around its policy. */
const CSP_META_PATTERN = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i

/**
 * Resolves and validates the runtime environment, then feeds the result into
 * `define` and `build.sourcemap`. Under `vp dev`, it also connects the dev
 * server to a real backend — see `devApiProxy` and `transformIndexHtml`.
 *
 * This lives in a plugin rather than a `defineConfig(({ mode }) => …)` callback
 * because Vite+ reads the `lint`/`fmt`/`staged` fields off a STATIC default
 * export — a function export breaks `vp fmt` and `vp lint`. The `config` hook
 * gets us the resolved mode while keeping the export static.
 *
 * @returns {import('vite-plus').Plugin}
 */
export function vuestrataEnv() {
  let isDemoBuild = true
  let outDir = 'dist'
  /** A cross-origin API the dev page must be allowed to reach, or null. */
  let devApiOrigin = null

  return {
    name: 'vuestrata:env',

    configResolved(resolved) {
      outDir = resolve(resolved.root, resolved.build.outDir)
    },

    /**
     * `public/mockServiceWorker.js` is a static asset, so Vite copies it into
     * dist for BOTH targets. In a production build that publishes a service
     * worker able to intercept every request in the app — dead weight at best,
     * and a confusing artifact for anyone auditing the deployment. Nothing
     * registers it there (the registration code is compiled out), so remove it.
     *
     * This runs in `closeBundle` rather than `generateBundle` because public-dir
     * files are copied straight to disk and never enter the rollup bundle.
     */
    async closeBundle() {
      if (isDemoBuild) return
      await rm(resolve(outDir, 'mockServiceWorker.js'), { force: true })
    },

    config(config, { mode, command, isPreview }) {
      // Nothing is being bundled: `vp dev`, `vp preview`, and Vitest, which
      // resolves as `serve` too. Only a build must refuse a local backend URL.
      const serving = command === 'serve'
      // The proxy is for `vp dev` alone. `vp preview` would inherit it through
      // `preview.proxy`, which defaults to `server.proxy`. Vitest starts no
      // server, so a proxy configured there never acts.
      const devServer = serving && !isPreview
      const isDev = serving || mode !== 'production'
      const envDir = resolveEnvDir(config)

      // The adapters the project registered, so its own adapter name is a
      // valid VUESTRATA_AUTH_ADAPTER and an unregistered one is not.
      const authAdapters = readAuthAdapters(resolve(config.root ?? process.cwd()))

      // Strict parse: an invalid or self-contradictory configuration fails the
      // BUILD here rather than reaching a browser. The app-side counterpart in
      // core/lib/config runs the same schema leniently.
      const env = parseRuntimeEnv(loadEnv(mode, envDir, 'VUESTRATA_'), {
        isDev,
        serving,
        authAdapters,
      })
      isDemoBuild = env.runtimeMode === 'demo'
      devApiOrigin = devServer ? crossOriginOf(env.apiUrl) : null

      // Read only by the dev server: a build never loads it, so it can never
      // reach `define` — and `envPrefix` never matches it, so it never reaches
      // `import.meta.env` either.
      const proxy = devServer
        ? devApiProxy(env.apiUrl, readDevApiTarget(mode, envDir), (message) => this.warn(message))
        : undefined

      return {
        define: {
          // Compile-time switch that lets rolldown dead-code-eliminate every
          // demo path (MSW, seeded IndexedDB users, demo credentials) out of a
          // production bundle. `appConfig` cannot do this — it is a runtime
          // value. Forced on under test so demo-state suites keep working.
          __VUESTRATA_DEMO__: JSON.stringify(mode === 'test' ? true : isDemoBuild),
          // The registrations just validated against, for the browser's own
          // (lenient) parse in core/lib/config: it must accept the adapter
          // names this build accepted, and it cannot import the app's file.
          __VUESTRATA_AUTH_ADAPTERS__: JSON.stringify(authAdapters),
        },
        build: {
          // 'hidden' emits .map files without the `//# sourceMappingURL=`
          // comment — useful for uploading to an error tracker, but the files
          // still ship and are fetchable by guessing the name. Emit them only
          // for the demo build; a real production deploy uploads them
          // out-of-band (see Dockerfile, which strips any that are generated).
          sourcemap: isDemoBuild ? 'hidden' : false,
        },
        ...(proxy ? { server: { proxy } } : {}),
      }
    },

    /**
     * Let the dev page reach a cross-origin API.
     *
     * `index.html` carries a CSP `<meta>` generated for the default same-origin
     * `/api` (scripts/security/headers.mjs), and the dev server serves it as
     * is. An absolute `VUESTRATA_API_URL` — which the schema accepts while
     * serving — would then have every API call blocked by the page's own
     * policy. So the served copy allows that one origin. A build never takes
     * this path: a deployment widens its policy from the same variable with
     * `sync-headers.mjs --api-url`.
     */
    transformIndexHtml(html, ctx) {
      if (!ctx.server || !devApiOrigin) return html
      return allowConnectTo(html, devApiOrigin)
    },
  }
}

/**
 * The auth adapters a project registered in `auth.config.ts`, as
 * `{ name: transport }`. Empty when the file is not there.
 *
 * @param {string} root The Vite root.
 * @returns {Record<string, 'bearer' | 'cookie'>}
 */
export function readAuthAdapters(root) {
  let source
  try {
    source = readFileSync(resolve(root, AUTH_CONFIG_FILE), 'utf8')
  } catch {
    // A project that has not taken the release that seeds the file: nothing
    // is registered, and only the built-in adapters are valid.
    return {}
  }
  return scanAuthAdapters(source)
}

/**
 * Read the `adapters` a project registered from the SOURCE of its
 * `auth.config.ts`, without running it.
 *
 * The build needs two facts from that file before it bundles anything: which
 * adapter names exist, so `VUESTRATA_AUTH_ADAPTER` can be checked against
 * them, and which transport each one uses, so the session-persistence rule
 * applies to a project's adapter as it does to the built-in ones. Importing
 * the file would get them, and would also run it — along with whatever it
 * imports, which for an auth adapter is typically an SDK that expects a
 * browser. So the file is parsed (by the parser the bundler already uses) and
 * the two facts are read off the syntax tree.
 *
 * The price is that `adapters` has to be written where a reader can see it:
 * an object literal, inline in the config, with plain names and each
 * `transport` a string literal. Anything else — a spread, a computed name, a
 * variable — fails here with a message that says so, rather than registering
 * an adapter the build cannot see. `boot()` checks the other half at
 * runtime: that each adapter really uses the transport written down.
 *
 * @param {string} source
 * @returns {Record<string, 'bearer' | 'cookie'>}
 */
export function scanAuthAdapters(source) {
  const fail = (problem) => {
    throw new Error(
      `[vuestrata:env] ${AUTH_CONFIG_FILE}: ${problem} The build reads the adapter names, and ` +
        "each adapter's `transport`, from this file without running it. Write `adapters` " +
        'inline in the object passed to defineAuthConfig(), as an object literal with plain ' +
        "names, and write each `transport` as the literal 'bearer' or 'cookie'.",
    )
  }

  let program
  try {
    program = parseAst(source, { lang: 'ts' })
  } catch (error) {
    throw new Error(`[vuestrata:env] ${AUTH_CONFIG_FILE} could not be parsed: ${error.message}`, {
      cause: error,
    })
  }

  // Type-level wrappers say nothing about the value inside them.
  const WRAPPERS = new Set([
    'TSAsExpression',
    'TSSatisfiesExpression',
    'TSNonNullExpression',
    'TSTypeAssertion',
    'ParenthesizedExpression',
  ])
  const unwrap = (node) => {
    let current = node
    while (current && WRAPPERS.has(current.type)) current = current.expression
    return current
  }
  const keyOf = (property) => {
    if (property.type !== 'Property' || property.computed) return undefined
    if (property.key.type === 'Identifier') return property.key.name
    return typeof property.key.value === 'string' ? property.key.value : undefined
  }
  /** The property called `name`, or undefined; a spread could be hiding it. */
  const find = (object, name, where) => {
    let found
    for (const property of object.properties) {
      if (property.type === 'SpreadElement') fail(`${where} uses a spread (\`...\`).`)
      if (keyOf(property) === name) found = property
    }
    return found
  }

  const exported = program.body.find((node) => node.type === 'ExportDefaultDeclaration')
  if (!exported) fail('it has no default export.')

  // `export default defineAuthConfig({ … })`, or the object itself.
  let config = unwrap(exported.declaration)
  if (config?.type === 'CallExpression') config = unwrap(config.arguments[0])
  if (config?.type !== 'ObjectExpression') {
    fail('its default export is not an object literal passed to defineAuthConfig().')
  }

  const property = find(config, 'adapters', 'the configuration')
  if (!property) return {}

  const adapters = unwrap(property.value)
  if (adapters?.type !== 'ObjectExpression') fail('`adapters` is not an object literal.')

  const registered = {}
  for (const entry of adapters.properties) {
    if (entry.type === 'SpreadElement') fail('`adapters` uses a spread (`...`).')
    const name = keyOf(entry)
    if (name === undefined) fail('`adapters` has a computed name.')
    if (!AUTH_ADAPTER_NAME.test(name)) {
      fail(
        `"${name}" is not a usable adapter name: use lowercase letters, digits and dashes, ` +
          'starting with a letter.',
      )
    }
    if (AUTH_ADAPTERS.includes(name)) {
      fail(
        `"${name}" is a built-in adapter and cannot be replaced; register yours under another name.`,
      )
    }

    // A function is a factory for a bearer adapter. An object states its own.
    const value = unwrap(entry.value)
    let transport = 'bearer'
    if (value?.type === 'ObjectExpression') {
      const declared = find(value, 'transport', `adapter "${name}"`)
      const literal = declared ? unwrap(declared.value) : undefined
      if (declared && literal?.value !== 'bearer' && literal?.value !== 'cookie') {
        fail(`adapter "${name}" does not declare its transport as a literal.`)
      }
      transport = literal?.value ?? 'bearer'
    }
    registered[name] = transport
  }
  return registered
}

/**
 * The directory Vite reads `.env` files from, resolved the way Vite resolves
 * it, so the values validated here are the values Vite inlines.
 */
function resolveEnvDir(config) {
  // `envFile: false` is the deprecated spelling of `envDir: false`.
  if (config.envDir === false || config.envFile === false) return false
  const root = resolve(config.root ?? process.cwd())
  return config.envDir ? resolve(root, config.envDir) : root
}

/**
 * `DEV_API_TARGET` from the environment or any `.env` file for `mode`.
 *
 * The variable's own name doubles as the prefix. The usual `''` would copy
 * every variable in the environment, and under `vp run` it would also hand
 * that empty prefix to the task runner, which `loadEnv` asks for matching
 * variables — making every variable in the environment an input of the task.
 */
function readDevApiTarget(mode, envDir) {
  return loadEnv(mode, envDir, DEV_API_TARGET)[DEV_API_TARGET]?.trim() || undefined
}

/**
 * `server.proxy` sending the API path to `DEV_API_TARGET`, or undefined.
 *
 * Only a same-origin path can be proxied: the browser asks the dev server for
 * `/api/users`, which forwards it unchanged to `${DEV_API_TARGET}/api/users`.
 * Seen from the browser, that is the reverse-proxy deployment `/api` stands for
 * — first-party cookies, no CORS. An absolute API URL sends the browser
 * straight to that origin, so the dev server never sees the request.
 */
function devApiProxy(apiUrl, target, warn) {
  if (!target) return undefined

  const path = sameOriginPath(apiUrl)
  if (path === undefined) {
    warn(
      `[vuestrata:env] ${DEV_API_TARGET} is set, but ${ENV_KEYS.apiUrl}="${apiUrl}" is absolute: ` +
        'the browser calls that origin directly, so nothing is proxied. To use the proxy, set ' +
        `${ENV_KEYS.apiUrl} to a same-origin path such as /api.`,
    )
    return undefined
  }
  if (path === '') {
    warn(
      `[vuestrata:env] ${DEV_API_TARGET} is set, but ${ENV_KEYS.apiUrl}="${apiUrl}" is the site ` +
        'root: proxying it would send the app itself to the backend, so nothing is proxied. ' +
        'Serve the API under a path such as /api.',
    )
    return undefined
  }

  return {
    // A RegExp key (Vite treats one starting with `^` as a pattern) that stops
    // at a segment boundary: `/api` and `/api/users`, but not `/api-docs`.
    [`^${escapeRegExp(path)}(?=[/?]|$)`]: {
      target: parseDevApiTarget(target),
      // The backend sees its own host in `Host`, as it would behind a real
      // proxy; `xfwd` passes the browser-facing one in `X-Forwarded-Host`,
      // which framework CSRF checks compare `Origin` against.
      changeOrigin: true,
      xfwd: true,
      ws: true,
      // Drop any `Domain` from `Set-Cookie`, so a session cookie lands on the
      // host the browser is actually talking to — the dev server — rather
      // than being rejected for naming the backend's.
      cookieDomainRewrite: '',
    },
  }
}

/**
 * The path of a same-origin API URL without its trailing slash (`/api/` →
 * `/api`), or undefined when the URL names an origin. `//host/api` is
 * protocol-relative — another origin — even though it starts with a slash.
 */
function sameOriginPath(apiUrl) {
  if (!apiUrl.startsWith('/') || apiUrl.startsWith('//')) return undefined
  return new URL(apiUrl, 'http://localhost').pathname.replace(/\/+$/, '')
}

/** The origin of an absolute http(s) API URL, or null for a same-origin one. */
function crossOriginOf(apiUrl) {
  if (sameOriginPath(apiUrl) !== undefined) return null
  try {
    const { origin, protocol } = new URL(apiUrl)
    return protocol === 'http:' || protocol === 'https:' ? origin : null
  } catch {
    return null
  }
}

/**
 * The target as given, once it is known to be an http(s) URL. Anything else
 * fails `vp dev` at startup: the developer asked for a proxy, and one that can
 * never connect would only surface later, as a proxy error on every request.
 */
function parseDevApiTarget(value) {
  let protocol
  try {
    protocol = new URL(value).protocol
  } catch {
    // Not a URL at all — reported below, like one with the wrong scheme.
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(
      `[vuestrata:env] ${DEV_API_TARGET} must be an absolute http(s) URL such as ` +
        `http://localhost:8000 (received "${value}").`,
    )
  }
  return value
}

/**
 * Add `origin` to the `connect-src` of the page's CSP `<meta>`. A policy with
 * no `connect-src` falls back to `default-src` for connections, so that case
 * gets an explicit `connect-src` carrying the same sources plus `origin`.
 */
function allowConnectTo(html, origin) {
  return html.replace(CSP_META_PATTERN, (meta, open, policy, close) => {
    // Each directive as [name, ...sources].
    const directives = policy
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
    const named = (name) => directives.find(([entry]) => entry.toLowerCase() === name)

    const connect = named('connect-src')
    const fallback = named('default-src')
    if (connect) {
      if (connect.includes(origin)) return meta
      connect.push(origin)
    } else if (fallback) {
      directives.push(['connect-src', ...fallback.slice(1), origin])
    } else {
      return meta
    }
    return `${open}${directives.map((tokens) => tokens.join(' ')).join('; ')}${close}`
  })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
