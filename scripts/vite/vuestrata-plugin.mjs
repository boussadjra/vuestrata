/**
 * Vuestrata's Vite plugin: where the validated runtime environment meets the
 * build and the dev server.
 *
 * It lives here rather than inline in `vite.config.ts` so that it can belong to
 * Vuestrata, which keeps improving it, while the config that calls it stays the
 * project's own. `vuestrata-plugin.d.mts` beside it keeps that config typed.
 */
import { existsSync, readFileSync } from 'node:fs'
import { rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { loadEnv, parseAst } from 'vite-plus'

// Relative imports, not aliases: this file runs in Node before `resolve.alias`
// exists. `env.schema.ts` and `deploy.ts` are dependency-free for exactly this
// reason. Explicit .ts extension: the config may be loaded as native ESM,
// which does not do extensionless resolution.
import { parseAppEnv } from '../../src/modules/core/lib/config/deploy.ts'
import {
  AUTH_ADAPTERS,
  ENV_KEYS,
  parseRuntimeEnv,
} from '../../src/modules/core/lib/config/env.schema.ts'
import { loadDeployConfig } from '../security/deploy-config.mjs'
// A namespace, not named imports: see `policyGenerators`.
import * as shippedHeaderGenerators from '../security/headers.mjs'

/**
 * The header generators, when they are the ones this plugin was written
 * against, or null beside a `scripts/security/headers.mjs` from before 1.1.0.
 *
 * That file is where a project puts its own policy, so it is the file a project
 * edits, and an edited copy is kept by the upgrade while this plugin, which is
 * new in 1.1.0, is installed beside it. The 1.0 file has no
 * `resolveDeployHeaders`, `resolveRuntimeKeys` or `replaceMetaCsp`, and a named
 * import of something a module does not export fails when the module is
 * linked: `vite.config.ts` would not load, and with it every `vp` command.
 * Read through a namespace, a missing member is `undefined` and can be asked
 * for. test/unit/cli/held-back-1.1.0.test.ts holds every managed script to this.
 */
function policyGenerators(headerGenerators) {
  const { resolveDeployHeaders, resolveRuntimeKeys, replaceMetaCsp } = headerGenerators
  return typeof resolveDeployHeaders === 'function' &&
    typeof resolveRuntimeKeys === 'function' &&
    typeof replaceMetaCsp === 'function'
    ? headerGenerators
    : null
}

/**
 * The seeded file a project registers its own auth adapters in, relative to
 * the Vite root. Not configurable: Vuestrata's bootstrap imports it from this
 * path.
 */
const AUTH_CONFIG_FILE = 'src/modules/app/config/auth.config.ts'

/** The same rule `core/lib/auth/config.ts` applies when the app starts. */
const AUTH_ADAPTER_NAME = /^[a-z][a-z0-9-]*$/

/**
 * Where `vp dev` forwards API requests. Deliberately NOT `VUESTRATA_`-prefixed:
 * Vite inlines every variable with that prefix into the client bundle, and the
 * address of a developer's backend has no business shipping to users.
 */
const DEV_API_TARGET = 'DEV_API_TARGET'

/**
 * Paths beside the API that `vp dev` forwards to `DEV_API_TARGET` as well: a
 * comma-separated list such as `/login,/logout,/sanctum`. Unprefixed for the
 * same reason.
 *
 * A backend that keeps a server session usually serves its session routes at
 * the root of its origin while the API lives under a path: Laravel answers
 * `POST /login` and `GET /sanctum/csrf-cookie` there, with the API under
 * `/api`. Proxying the API path alone leaves those requests with the dev
 * server, which answers them with the app's own index.html.
 */
const DEV_PROXY_PATHS = 'DEV_PROXY_PATHS'

/**
 * The script every page loads before the app bundle. It assigns
 * `window.__VUESTRATA_RUNTIME__`, the values a deployment sets when the app
 * STARTS rather than when it is built (see core/lib/config/runtime-overlay.ts).
 *
 * `public/runtime-config.js` is the copy that ships: an empty overlay, which a
 * deployment replaces — the container entrypoint writes one from its
 * environment, and nginx serves that instead.
 */
const RUNTIME_CONFIG_FILE = 'runtime-config.js'

/** What the file holds when nothing overrides anything. */
const EMPTY_RUNTIME_CONFIG = 'window.__VUESTRATA_RUNTIME__ ||= {}\n'

const CSP_HEADER = 'Content-Security-Policy'

/** The page's CSP `<meta>` tag, whole, and the charset one. */
const CSP_META_TAG = /<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i
const CHARSET_META_TAG = /<meta\s+charset=[^>]*>/i

/**
 * Resolves and validates the runtime environment, then feeds the result into
 * `define` and `build.sourcemap`. Under `vp dev`, it also connects the dev
 * server to a real backend — see `devApiProxy`. It makes every page load the
 * runtime configuration first — see `transformIndexHtml`. And it sends the
 * Content Security Policy a deployment would send from `vp dev` and
 * `vp preview` — see `configureServer`.
 *
 * This lives in a plugin rather than a `defineConfig(({ mode }) => …)` callback
 * because Vite+ reads the `lint`/`fmt`/`staged` fields off a STATIC default
 * export — a function export breaks `vp fmt` and `vp lint`. The `config` hook
 * gets us the resolved mode while keeping the export static.
 *
 * @param {object} [options]
 * @param {object} [options.deployConfig] The project's deployment config, in
 *   place of reading `src/modules/app/config/deploy.config.ts`. For tests.
 * @param {object} [options.headerGenerators] The exports of
 *   `scripts/security/headers.mjs`, in place of importing it. For tests.
 * @returns {import('vite-plus').Plugin}
 */
export function vuestrataEnv(options = {}) {
  const generators = policyGenerators(options.headerGenerators ?? shippedHeaderGenerators)
  let isDemoBuild = true
  let outDir = 'dist'
  let publicDir = 'public'
  /** Vite's `base`: where the app's own files are served from. */
  let base = '/'
  /**
   * What the served policy is built from — the API URL, the project's header
   * sources, the variables they name — or null when nothing is being served.
   */
  let served = null
  /** The origin of a cross-origin API URL a BUILD was given, or null. */
  let builtApiOrigin = null

  /** The policy for what is being served: the header, or the `<meta>` variant. */
  const servedCsp = ({ forMeta = false, extraOrigins = [] } = {}) =>
    generators.buildCsp({ ...served, forMeta, extraOrigins })

  return {
    name: 'vuestrata:env',

    configResolved(resolved) {
      outDir = resolve(resolved.root, resolved.build.outDir)
      publicDir = resolved.publicDir
      base = resolved.base
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
     *
     * The same reasoning, the other way round, for `runtime-config.js`: every
     * page asks for it, so a build must never lack it. A project whose
     * `public/` has no copy gets the empty one here, rather than a page whose
     * first script is a 404 — or, behind an SPA fallback, index.html parsed
     * as JavaScript.
     */
    async closeBundle() {
      if (!existsSync(outDir)) return
      if (!existsSync(resolve(outDir, RUNTIME_CONFIG_FILE))) {
        await writeFile(resolve(outDir, RUNTIME_CONFIG_FILE), EMPTY_RUNTIME_CONFIG)
      }
      if (isDemoBuild) return
      await rm(resolve(outDir, 'mockServiceWorker.js'), { force: true })
    },

    /**
     * `vp dev` sends the policy a deployment would send.
     *
     * Without it, a request to an origin nobody declared works on the
     * developer's machine and is blocked in the first deployment that sends
     * headers, which is the worst place to learn that `connectSrc` in
     * `deploy.config.ts` is missing an entry. With it, the violation is in the
     * console while the code that causes it is still on screen.
     *
     * It is the production policy, enforced, with ONE addition: see
     * `devSocketOrigins`. Nothing else was needed. Vite's client and the
     * modules it serves are same-origin scripts, hot updates use no `eval`, and
     * source maps are read by the devtools, which no page policy governs.
     *
     * Also the dev server's answer for `runtime-config.js` when `public/` has
     * none, so that `vp dev` behaves like the build above. With the file in
     * place Vite serves it as it serves anything under `public/`, and this
     * stays out of the way.
     */
    configureServer(server) {
      if (served) {
        server.middlewares.use((request, response, next) => {
          if (!isMockWorker(request, base)) {
            response.setHeader(CSP_HEADER, servedCsp({ extraOrigins: devSocketOrigins(server) }))
          }
          next()
        })
      }

      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]
        if (
          path !== `${base}${RUNTIME_CONFIG_FILE}` ||
          (publicDir && existsSync(resolve(publicDir, RUNTIME_CONFIG_FILE)))
        ) {
          next()
          return
        }
        response.setHeader('Content-Type', 'text/javascript')
        response.setHeader('Cache-Control', 'no-store')
        response.end(EMPTY_RUNTIME_CONFIG)
      })
    },

    /**
     * `vp preview` sends the policy too, exactly as generated: it serves a
     * build, and the point of previewing one is to see what a deployment
     * would do. The page's own `<meta>` is whatever the build wrote, as it
     * will be on a static host.
     */
    configurePreviewServer(server) {
      if (!served) return
      const policy = servedCsp()
      server.middlewares.use((request, response, next) => {
        if (!isMockWorker(request, base)) response.setHeader(CSP_HEADER, policy)
        next()
      })
    },

    async config(config, { mode, command, isPreview }) {
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
      const { adapters: authAdapters, declared } = readAuthConfig(
        resolve(config.root ?? process.cwd()),
      )
      // The same names, as the project declared them to the type checker. A
      // difference breaks nothing at runtime, which is why it is said here:
      // nothing else would.
      for (const message of describeUndeclaredAdapters(authAdapters, declared)) this.warn(message)

      // Strict parse: an invalid or self-contradictory configuration fails the
      // BUILD here rather than reaching a browser. The app-side counterpart in
      // core/lib/config runs the same schema leniently.
      const rawEnv = loadEnv(mode, envDir, 'VUESTRATA_')
      const env = parseRuntimeEnv(rawEnv, { isDev, serving, authAdapters })
      isDemoBuild = env.runtimeMode === 'demo'

      // The project's own half of the configuration, held to the same standard:
      // an invalid variable or an impossible header source fails here, with the
      // file to fix named, rather than in a browser or in a container that will
      // not start. Vitest is left out. It runs the app's modules, where the
      // lenient reading applies, and a test run should not need the variables
      // of a deployment to begin.
      if (mode !== 'test') {
        const root = resolve(config.root ?? process.cwd())
        const deployConfig = options.deployConfig ?? (await loadDeployConfig({ root }))
        parseAppEnv(deployConfig, rawEnv, { reservedKeys: Object.values(ENV_KEYS) })

        // Beside the header generators a project kept from 1.0 there is no
        // policy to build from this file: `served` stays null, so no server
        // sends one and no page is checked against one, as in 1.0.
        if (!generators) {
          this.warn(
            '[vuestrata:env] scripts/security/headers.mjs is a copy from before 1.1.0, so ' +
              'the `headers` and `runtime` in deploy.config.ts are not checked, and `vp dev` and ' +
              '`vp preview` send no Content-Security-Policy. Merge your policy into ' +
              '.vuestrata/incoming/scripts/security/headers.mjs, take sync-headers.mjs from ' +
              'beside it, and run `vuestrata adopt` on both.',
          )
        }
        const headers = generators?.resolveDeployHeaders(deployConfig.headers)
        generators?.resolveRuntimeKeys([], deployConfig.runtime ?? [])

        // A server is about to answer requests: `vp dev` or `vp preview`. The
        // policy it sends is built from what a deployment's would be built
        // from, and built once here, so an API URL no policy can name stops
        // the server with the reason instead of blocking every call later.
        if (generators && serving) {
          served = {
            apiUrl: env.apiUrl,
            headers: deployConfig.headers,
            env: readNamedEnv(mode, envDir, [
              ...headers.connectSrcFromEnv,
              ...headers.websocketFromEnv,
            ]),
          }
          servedCsp()
        } else if (generators) {
          builtApiOrigin = crossOriginOf(generators, env.apiUrl)
        }
      }

      // Read only by the dev server: a build never loads it, so it can never
      // reach `define` — and `envPrefix` never matches it, so it never reaches
      // `import.meta.env` either.
      const proxy = devServer
        ? devApiProxy(
            env.apiUrl,
            readDevApiTarget(mode, envDir),
            (message) => this.warn(message),
            readDevProxyPaths(mode, envDir),
          )
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
          // The adapter is chosen when the app is built, so a bundle made for
          // another one has no use for the cookie-session adapter. A literal
          // `false` lets rolldown drop it, as `__VUESTRATA_DEMO__` drops the
          // mock one (see auth/adapters/registry.ts). Not forced on under
          // test: the registry is tested as the build it describes, and a
          // test of that adapter says so.
          __VUESTRATA_SESSION_ADAPTER__: JSON.stringify(env.authAdapter === 'session'),
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
     * Load the runtime configuration before the app.
     *
     * A classic script, not a module and not a fetch: a classic script in the
     * document runs before any module script does, and the values have to be in
     * place by then — `runtimeEnv` and the API client's base URL are resolved
     * while their modules are evaluated.
     *
     * It is added here, after Vite has processed the page, so that nothing
     * bundles or inlines it: the file has to stay a separate URL that a
     * deployment can answer differently, and `script-src 'self'` would refuse
     * an inline copy anyway. For the same reason the URL is built from `base`
     * by hand rather than left for Vite to rewrite.
     *
     * Under `vp dev` the page's CSP `<meta>` is also rendered for the
     * environment being served, like the header `configureServer` sends. The
     * committed tag is generated for the default `/api`, and a browser
     * enforces it in addition to the header, so a developer pointing
     * `VUESTRATA_API_URL` at another origin would otherwise have every call
     * blocked by the page itself. A build is left as written: its tag is the
     * generator's (`sync-headers.mjs`), which is also what a deployment gets.
     * When that tag does not allow the API origin the build was given, the
     * build says so: nothing else would until a browser blocked the calls.
     */
    transformIndexHtml(html, ctx) {
      const page =
        ctx.server && served
          ? (generators.replaceMetaCsp(
              html,
              servedCsp({ forMeta: true, extraOrigins: devSocketOrigins(ctx.server) }),
            ) ?? html)
          : html
      const src = `${base}${RUNTIME_CONFIG_FILE}`

      if (!ctx.server && builtApiOrigin && metaBlocksConnectionTo(page, builtApiOrigin)) {
        this.warn?.(
          `[vuestrata:env] ${ENV_KEYS.apiUrl} is on ${builtApiOrigin}, which the CSP <meta> in ` +
            'index.html does not allow: a browser will block the API calls of this build. ' +
            'Render the headers for this environment before building ' +
            '(`node scripts/security/sync-headers.mjs --from-env`), or with `--runtime-config` ' +
            'when the API URL is set at start through runtime-config.js.',
        )
      }

      return (
        withRuntimeConfigScript(page, src) ?? {
          html: page,
          // A page with neither tag to put it after: first in the document.
          tags: [{ tag: 'script', attrs: { src }, injectTo: 'head-prepend' }],
        }
      )
    },
  }
}

/**
 * `html` with `<script src>` directly after the CSP `<meta>` — or, on a page
 * without one, after `<meta charset>` — or null when it has neither.
 *
 * After both on purpose. A browser must meet the charset declaration before
 * any content, and a policy delivered in a `<meta>` governs only what follows
 * it: a script placed ahead of the tag would load outside the page's own
 * policy. It still precedes the app's module script in the source, which Vite
 * puts at the end of `<head>`, so nobody has to know that a classic script
 * runs before any module to see that the configuration comes first.
 */
function withRuntimeConfigScript(html, src) {
  const anchor = CSP_META_TAG.exec(html) ?? CHARSET_META_TAG.exec(html)
  if (!anchor) return null

  const end = anchor.index + anchor[0].length
  const indent = /[ \t]*$/.exec(html.slice(0, anchor.index))[0]
  const escaped = src.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `${html.slice(0, end)}\n${indent}<script src="${escaped}"></script>${html.slice(end)}`
}

/**
 * The origin of an absolute API URL as a CSP source, or null for a same-origin
 * path and for a URL no source can name. Never throws: it only decides whether
 * a build has something to warn about.
 */
function crossOriginOf(generators, apiUrl) {
  try {
    return generators.connectSrcFor(apiUrl)
  } catch {
    return null
  }
}

/**
 * Whether the page's CSP `<meta>` would block a connection to `origin`: it
 * states a `connect-src` that neither names the origin nor is left open. A
 * page with no such tag, or no such directive to read, blocks nothing here.
 */
function metaBlocksConnectionTo(html, origin) {
  const policy = /\scontent="([^"]*)"/.exec(CSP_META_TAG.exec(html)?.[0] ?? '')?.[1]
  const sources = /(?:^|;)\s*connect-src\s+([^;]*)/
    .exec(policy ?? '')?.[1]
    ?.trim()
    .split(/\s+/)
  if (sources === undefined) return false

  // `https://*.acme.com` names `https://api.acme.com`: same scheme and port,
  // and a host that ends with the part after the star.
  const [scheme, authority] = origin.split('://')
  const names = (source) =>
    source === '*' ||
    source === origin ||
    (source.startsWith(`${scheme}://*.`) &&
      authority.endsWith(source.slice(`${scheme}://*`.length)) &&
      authority.includes(':') === source.slice(`${scheme}://`.length).includes(':'))
  return !sources.some(names)
}

/**
 * Whether the request is for the MSW worker script, the one response the
 * policy is NOT sent with.
 *
 * A service worker is governed by the policy its own script was served with,
 * not by the page's. The demo's worker answers the requests it has a handler
 * for and re-fetches every other one itself, the web fonts included, and a
 * worker's `fetch()` falls under `connect-src`. Served with this policy, whose
 * `connect-src` names no font host, the worker blocks every font of a page it
 * controls (`net::ERR_FAILED`, and nothing in the page's console says why).
 *
 * Leaving the header off this one script keeps `vp dev` and `vp preview`
 * working as they did before they sent a policy. It is a known difference
 * from a demo deployed behind the generated headers, which apply to the
 * worker script as well. Production builds have no worker and are unaffected.
 */
function isMockWorker(request, base) {
  return request.url?.split('?')[0] === `${base}mockServiceWorker.js`
}

/**
 * What `vp dev` needs that a deployment does not: the WebSocket Vite's client
 * opens to the dev server for hot updates.
 *
 * It goes to the page's own host and port, which `'self'` covers in a browser
 * that follows CSP 3. Not every browser matches `ws:` against an `http:` page
 * that way, so each address the dev server answers on is named: without the
 * socket the page loads and then never updates, with nothing but a console
 * line to say why. An address no source can name (an IPv6 literal) is left to
 * `'self'`.
 */
function devSocketOrigins(server) {
  const urls = [...(server.resolvedUrls?.local ?? []), ...(server.resolvedUrls?.network ?? [])]
  const origins = urls.flatMap((url) => {
    try {
      const { protocol, host } = new URL(url)
      return [`${protocol === 'https:' ? 'wss' : 'ws'}://${host}`]
    } catch {
      return []
    }
  })
  return [...new Set(origins)].filter((origin) => /^wss?:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin))
}

/**
 * The named variables, from the environment or any `.env` file for `mode`.
 * One name at a time, each as its own prefix: see `readDevApiTarget`.
 */
function readNamedEnv(mode, envDir, names) {
  return Object.fromEntries(names.map((name) => [name, loadEnv(mode, envDir, name)[name]]))
}

/**
 * What the build reads from the project's `auth.config.ts` under `root`:
 * the adapters it registers, as `{ name: transport }`, and the adapter names
 * it declares to the type checker. Both empty when the file is not there.
 *
 * @param {string} root The Vite root.
 * @returns {{ adapters: Record<string, 'bearer' | 'cookie'>, declared: string[] }}
 */
export function readAuthConfig(root) {
  let source
  try {
    source = readFileSync(resolve(root, AUTH_CONFIG_FILE), 'utf8')
  } catch {
    // A project that has not taken the release that seeds the file: nothing
    // is registered, and only the built-in adapters are valid.
    return { adapters: {}, declared: [] }
  }
  return scanAuthConfig(source)
}

/**
 * The auth adapters a project registered in `auth.config.ts`, as
 * `{ name: transport }`. Empty when the file is not there.
 *
 * @param {string} root The Vite root.
 * @returns {Record<string, 'bearer' | 'cookie'>}
 */
export function readAuthAdapters(root) {
  return readAuthConfig(root).adapters
}

/**
 * The `adapters` registered in the SOURCE of an `auth.config.ts`, as
 * `{ name: transport }`. See `scanAuthConfig`.
 *
 * @param {string} source
 * @returns {Record<string, 'bearer' | 'cookie'>}
 */
export function scanAuthAdapters(source) {
  return scanAuthConfig(source).adapters
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
 * The price is that the registrations have to be written where a reader can
 * see them, and the rule is strict in one direction on purpose: whatever this
 * cannot read for certain FAILS, with a message that says how to write it. The
 * alternative is reading a file that registers an adapter as registering none
 * — and then telling the project to register what it did register — or
 * reading a cookie-transport adapter as a bearer one and validating the wrong
 * rule. What is accepted:
 *
 *   - the default export is an object literal, or `defineAuthConfig(…)` called
 *     with exactly one, with no spread and no computed key in it;
 *   - `adapters` is an object literal with plain names;
 *   - each adapter is written inline: a function (a factory, whose adapter
 *     uses bearer transport), or an object literal with no spread and no
 *     computed key, whose `transport` is absent or the literal `'bearer'` or
 *     `'cookie'`.
 *
 * `boot()` checks the other half at runtime: that each adapter really uses the
 * transport read here.
 *
 * It also reads the names the file declares in `RegisteredAuthAdapterNames`,
 * the interface a project augments so that the TYPE of the configured adapter
 * includes its own. Those are returned as `declared`, for the build to say
 * when they and the registered names have drifted apart.
 *
 * @param {string} source
 * @returns {{ adapters: Record<string, 'bearer' | 'cookie'>, declared: string[] }}
 */
export function scanAuthConfig(source) {
  const fail = (problem) => {
    throw new Error(
      `[vuestrata:env] ${AUTH_CONFIG_FILE}: ${problem} The build reads the adapter names, and ` +
        "each adapter's `transport`, from this file without running it. Write `adapters` " +
        'inline in the object passed to defineAuthConfig(), as an object literal with plain ' +
        'names, and write each adapter inline too: a function, or an object whose `transport` ' +
        "is the literal 'bearer' or 'cookie'.",
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
  /** The name a property is written under, or undefined when it is computed. */
  const keyOf = (property) => {
    if (property.type !== 'Property' || property.computed) return undefined
    if (property.key.type === 'Identifier') return property.key.name
    return typeof property.key.value === 'string' ? property.key.value : undefined
  }
  /**
   * The property called `name`, or undefined. A spread or a computed key
   * anywhere in the object could be that property under another spelling, so
   * either one fails rather than being read as "not there".
   */
  const find = (object, name, where) => {
    let found
    for (const property of object.properties) {
      if (property.type === 'SpreadElement') fail(`${where} uses a spread (\`...\`).`)
      const key = keyOf(property)
      if (key === undefined) fail(`${where} has a computed key (\`[…]: …\`).`)
      if (key === name) found = property
    }
    return found
  }
  /** A property written `name: value`, and not as a getter. */
  const isPlainValue = (property) => property.kind === undefined || property.kind === 'init'

  const exported = program.body.find((node) => node.type === 'ExportDefaultDeclaration')
  if (!exported) fail('it has no default export.')

  // `export default defineAuthConfig({ … })`, or the object itself. Any other
  // call could build the configuration from anything: `merge(a, { adapters })`
  // holds the adapters in its second argument, and reading its first would
  // find none.
  let config = unwrap(exported.declaration)
  if (config?.type === 'CallExpression') {
    if (config.callee.type !== 'Identifier' || config.callee.name !== 'defineAuthConfig') {
      fail('its default export is a call to something other than defineAuthConfig().')
    }
    if (config.arguments.length !== 1 || config.arguments[0].type === 'SpreadElement') {
      fail('defineAuthConfig() is not called with exactly one argument.')
    }
    config = unwrap(config.arguments[0])
  }
  if (config?.type !== 'ObjectExpression') {
    fail('its default export is not an object literal passed to defineAuthConfig().')
  }

  const declared = scanDeclaredAdapterNames(program)

  const property = find(config, 'adapters', 'the configuration')
  if (!property) return { adapters: {}, declared }

  const adapters = isPlainValue(property) ? unwrap(property.value) : undefined
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

    const value = isPlainValue(entry) ? unwrap(entry.value) : undefined
    if (value?.type === 'ArrowFunctionExpression' || value?.type === 'FunctionExpression') {
      // A function is a factory, and its adapter uses bearer transport.
      registered[name] = 'bearer'
    } else if (value?.type === 'ObjectExpression') {
      const transport = find(value, 'transport', `adapter "${name}"`)
      const literal = transport && isPlainValue(transport) ? unwrap(transport.value) : undefined
      const stated = literal?.type === 'Literal' ? literal.value : undefined
      if (transport && stated !== 'bearer' && stated !== 'cookie') {
        fail(`adapter "${name}" does not declare its transport as a literal.`)
      }
      registered[name] = stated ?? 'bearer'
    } else {
      // A variable, a call, a member: whatever it evaluates to, it could be a
      // registration that says `transport: 'cookie'`, and reading it as a
      // bearer factory would validate the wrong session-persistence rule.
      fail(
        `adapter "${name}" is not written inline, so its transport cannot be read. Declare it ` +
          `inline with a literal transport: \`${name}: { transport: 'bearer', create: … }\`.`,
      )
    }
  }
  return { adapters: registered, declared }
}

/**
 * The names a file declares in `RegisteredAuthAdapterNames`:
 *
 *   declare module '~/lib/auth' {
 *     interface RegisteredAuthAdapterNames {
 *       acme: true
 *     }
 *   }
 */
function scanDeclaredAdapterNames(program) {
  const names = []
  for (const node of program.body) {
    if (node.type !== 'TSModuleDeclaration' || node.body?.type !== 'TSModuleBlock') continue
    for (const statement of node.body.body) {
      // `interface …` and `export interface …` merge alike.
      const declaration =
        statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
      if (
        declaration?.type !== 'TSInterfaceDeclaration' ||
        declaration.id.name !== 'RegisteredAuthAdapterNames'
      ) {
        continue
      }
      for (const member of declaration.body.body) {
        if (member.type !== 'TSPropertySignature' || member.computed) continue
        const name = member.key.type === 'Identifier' ? member.key.name : member.key.value
        if (typeof name === 'string') names.push(name)
      }
    }
  }
  return names
}

/**
 * What to tell a project whose registered adapters and declared adapter names
 * differ. One message per name; none when they agree.
 *
 * Registering an adapter is what makes it work, and declaring its name is what
 * makes `appConfig.authProvider` (and everything else typed `AuthAdapterName`)
 * include it. An adapter registered and not declared runs correctly under a
 * type that says it cannot be selected, and no type error points at the cause:
 * so the build says it. These are warnings, not failures, because nothing is
 * wrong with the bundle.
 *
 * @param {Record<string, 'bearer' | 'cookie'>} adapters
 * @param {readonly string[]} declared
 * @returns {string[]}
 */
export function describeUndeclaredAdapters(adapters, declared) {
  const messages = []
  for (const name of Object.keys(adapters)) {
    if (declared.includes(name)) continue
    const key = /^[a-z][a-z0-9]*$/.test(name) ? name : `'${name}'`
    messages.push(
      `[vuestrata:env] ${AUTH_CONFIG_FILE} registers the adapter "${name}" without declaring ` +
        'its name, so the type of `appConfig.authProvider` does not include it. Add to that ' +
        `file:\n\n  declare module '~/lib/auth' {\n    interface RegisteredAuthAdapterNames {\n` +
        `      ${key}: true\n    }\n  }\n`,
    )
  }
  for (const name of declared) {
    if (Object.hasOwn(adapters, name)) continue
    messages.push(
      `[vuestrata:env] ${AUTH_CONFIG_FILE} declares "${name}" in RegisteredAuthAdapterNames, ` +
        'but registers no adapter by that name under `adapters`: ' +
        `${ENV_KEYS.authAdapter}=${name} would type-check and then fail the build. Register ` +
        'the adapter, or remove the declaration.',
    )
  }
  return messages
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

/** `DEV_PROXY_PATHS`, read the way `DEV_API_TARGET` is, or undefined. */
function readDevProxyPaths(mode, envDir) {
  return loadEnv(mode, envDir, DEV_PROXY_PATHS)[DEV_PROXY_PATHS]?.trim() || undefined
}

/**
 * The paths in a `DEV_PROXY_PATHS` value, each without its trailing slash.
 *
 * Each has to be a path of its own under the site root. Anything else fails
 * `vp dev` at startup, like a target that is not a URL: `/` would send the app
 * itself to the backend, and a value with a host, a query or a pattern in it
 * is a mistake that would otherwise surface as requests going nowhere.
 */
function parseDevProxyPaths(value) {
  const paths = value
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((path) => (path.length > 1 ? path.replace(/\/+$/, '') : path))

  for (const path of paths) {
    if (!/^\/[\w~.-]+(?:\/[\w~.-]+)*$/.test(path)) {
      throw new Error(
        `[vuestrata:env] ${DEV_PROXY_PATHS} must be a comma-separated list of paths such as ` +
          `/login,/logout,/sanctum: each one rooted, with a name after the "/", and no host, ` +
          `query or pattern (received "${path}").`,
      )
    }
  }
  return [...new Set(paths)]
}

/**
 * `server.proxy` sending the API path to `DEV_API_TARGET`, or undefined.
 *
 * Only a same-origin path can be proxied: the browser asks the dev server for
 * `/api/users`, which forwards it unchanged to `${DEV_API_TARGET}/api/users`.
 * Seen from the browser, that is the reverse-proxy deployment `/api` stands for
 * — first-party cookies, no CORS. An absolute API URL sends the browser
 * straight to that origin, so the dev server never sees the request.
 *
 * `extraPaths` (`DEV_PROXY_PATHS`) are forwarded the same way, with the same
 * options: they are the backend's own routes beside its API, and a session
 * cookie set by `/login` has to land on the dev server's host exactly as one
 * set under the API path does. They need the API proxy to mean anything, so
 * without one they are reported and left out.
 */
function devApiProxy(apiUrl, target, warn, extraPaths) {
  // Checked first, so a list that cannot be meant fails wherever it is set.
  const extra = extraPaths ? parseDevProxyPaths(extraPaths) : []

  if (!target) {
    if (extra.length > 0) {
      warn(
        `[vuestrata:env] ${DEV_PROXY_PATHS} is set, but ${DEV_API_TARGET} is not: there is no ` +
          'backend to forward those paths to, so nothing is proxied.',
      )
    }
    return undefined
  }

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

  const backend = parseDevApiTarget(target)
  const rule = () => ({
    target: backend,
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
  })
  // A RegExp key (Vite treats one starting with `^` as a pattern) that stops
  // at a segment boundary: `/api` and `/api/users`, but not `/api-docs`.
  const key = (prefix) => `^${escapeRegExp(prefix)}(?=[/?]|$)`

  const proxy = { [key(path)]: rule() }
  for (const extraPath of extra) {
    // Already forwarded: the API path itself, or something under it.
    if (extraPath === path || extraPath.startsWith(`${path}/`)) continue
    proxy[key(extraPath)] = rule()
  }
  return proxy
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
